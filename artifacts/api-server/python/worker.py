"""Isolated request worker. Receives private temporary paths and emits actual outputs."""
import contextlib
import io
import json
import re
import sys
from pathlib import Path

import pymupdf as fitz

import conversions
import intelligence
from common import (MAX_PAGES, html_pdf, image_pdf, number, open_pdf, output,
                    page_list, saved, selected_page, text_pdf, zip_outputs)


def inspect_document(path, options):
    with open_pdf(path, options.get("password", "")) as doc:
        pages, fields = [], []
        for i, page in enumerate(doc):
            preview = ""
            if i < 12 and page.rect.width * page.rect.height < 2_000_000:
                import base64
                preview = base64.b64encode(page.get_pixmap(matrix=fitz.Matrix(0.3, 0.3)).tobytes("png")).decode()
            pages.append({"number": i+1, "width": page.rect.width, "height": page.rect.height,
                          "rotation": page.rotation, "previewBase64": preview})
            for widget in page.widgets() or []:
                fields.append({"name": widget.field_name or "", "value": str(widget.field_value or ""),
                               "type": widget.field_type_string, "page": i+1})
        return {"pageCount": len(doc), "encrypted": bool(doc.is_encrypted),
                "pages": pages, "formFields": fields}


def process(request):
    paths = [Path(p) for p in request["paths"]]
    options = request.get("options", {})
    slug = request["slug"]
    work = paths[0].parent
    if slug == "inspect":
        return inspect_document(paths[0], options)
    from excel_tools import dispatch as excel_dispatch
    excel_result = excel_dispatch(slug, paths, options)
    if excel_result is not None:
        return excel_result
    from word_tools import dispatch as word_dispatch
    word_result = word_dispatch(slug, paths, options)
    if word_result is not None:
        return word_result
    from extras import dispatch
    extra = dispatch(slug, paths, options)
    if extra is not None:
        return extra
    files, warnings, text, message = [], [], "", "Your document has been processed."
    original = sum(p.stat().st_size for p in paths)
    count = 0
    extension = ".pdf"
    data = None

    if slug in {"jpg-to-pdf", "scan-to-pdf"}:
        with image_pdf(paths, options) as doc:
            data, count = saved(doc), len(doc)
    elif slug in {"word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf"}:
        data, count = conversions.office_to_pdf(paths[0], work)
        warnings.append("Office rendering can differ when fonts or proprietary features are unavailable. Review the PDF.")
    elif slug == "html-to-pdf":
        data, count = conversions.html_to_pdf(paths[0])
        warnings.append("Scripts, remote resources and embedded images are removed. Document-oriented HTML is rendered locally.")
    elif slug == "ocr-pdf":
        data, count = conversions.ocr(paths[0], work)
        warnings.append("English printed-text OCR can be inaccurate. Review the recognized text before relying on it.")
    else:
        doc = open_pdf(paths[0], options.get("password", "") if slug != "protect-pdf" else "")
        try:
            count = len(doc)
            if slug == "merge-pdf":
                if len(paths) < 2:
                    raise ValueError("Choose at least two PDFs to merge.")
                result = fitz.open()
                for path in paths:
                    with open_pdf(path, options.get("password", "")) as part:
                        if len(result) + len(part) > MAX_PAGES:
                            raise ValueError(f"Merged output exceeds {MAX_PAGES} pages.")
                        result.insert_pdf(part, widgets=True)
                data, count = saved(result), len(result)
                result.close()
            elif slug in {"split-pdf", "remove-pages", "organize-pdf"}:
                if slug == "split-pdf" and options.get("mode", "range") == "every-page":
                    parts = []
                    for i in range(len(doc)):
                        result = fitz.open()
                        result.insert_pdf(doc, from_page=i, to_page=i, widgets=True)
                        parts.append((f"page-{i+1:04d}.pdf", saved(result)))
                        result.close()
                    data, extension = zip_outputs(parts), ".zip"
                else:
                    if slug == "organize-pdf":
                        indices = page_list(options.get("order", ""), len(doc), allow_duplicates=True)
                    elif slug == "remove-pages":
                        removed = set(page_list(options.get("pages", ""), len(doc), required=True))
                        indices = [i for i in range(len(doc)) if i not in removed]
                        if not indices:
                            raise ValueError("At least one page must remain.")
                    else:
                        indices = page_list(options.get("pages", ""), len(doc))
                    doc.select(indices)
                    data, count = saved(doc), len(doc)
            elif slug == "compress-pdf":
                quality = options.get("quality", "balanced")
                if quality not in {"lossless", "balanced", "smallest"}:
                    raise ValueError("Choose lossless, balanced or smallest compression.")
                if quality != "lossless":
                    doc.rewrite_images(dpi_threshold=150 if quality == "balanced" else 100,
                                       dpi_target=120 if quality == "balanced" else 72,
                                       quality=75 if quality == "balanced" else 45)
                    warnings.append("Embedded images may be recompressed lossily. Page sizes are retained.")
                data = saved(doc)
                if len(data) >= paths[0].stat().st_size:
                    data = paths[0].read_bytes()
                    message = "No smaller result was found. Your original document is returned unchanged."
                else:
                    reduction = 100 * (1 - len(data) / paths[0].stat().st_size)
                    message = f"Reduced the actual file size by {reduction:.1f}%."
            elif slug == "repair-pdf":
                repaired = doc.is_repaired
                data = doc.tobytes(garbage=4, deflate=True, clean=True)
                message = "Recovered and rewrote readable PDF structures." if repaired else "The PDF was readable; its objects were cleaned and rewritten."
                warnings.append("Content that is missing or destroyed cannot be recovered.")
            elif slug == "pdf-to-jpg":
                data, extension = conversions.jpg(doc, options), ".zip"
                message = "Real JPEG page images are ready in a ZIP."
            elif slug == "pdf-to-word":
                data, extension = conversions.word(doc), ".docx"
                warnings.append("Text and images are extracted into Word. Complex layouts may require editing; scanned pages remain images.")
            elif slug == "pdf-to-powerpoint":
                data, extension = conversions.powerpoint(doc), ".pptx"
                warnings.append("Each page is a slide image; individual text elements are not editable.")
            elif slug == "pdf-to-excel":
                data, table_count = conversions.excel(doc)
                extension = ".xlsx"
                message = f"Extracted {table_count} detected tables into a real workbook." if table_count else "No tables detected. Extracted page text is provided in a labelled worksheet."
                if not table_count:
                    warnings.append("No table structure was detected; this workbook contains extracted text, not reconstructed tables.")
            elif slug == "pdf-to-pdfa":
                data, count = conversions.pdfa(paths[0], work)
                warnings.append("Converted through PDF/A-2 engine with archival identification and color profile checks. Independent conformance certification is not provided.")
            elif slug in {"rotate-pdf", "page-numbers", "watermark-pdf", "crop-pdf"}:
                indices = page_list(options.get("pages", ""), len(doc))
                if slug == "rotate-pdf":
                    angle = number(options, "angle", 90, 90, 270, integer=True)
                    if angle not in {90, 180, 270}:
                        raise ValueError("Rotation must be 90, 180 or 270 degrees.")
                    for i in indices:
                        doc[i].set_rotation((doc[i].rotation + angle) % 360)
                elif slug == "page-numbers":
                    start = number(options, "start", 1, 0, 100000, integer=True)
                    location = options.get("position", "bottom-center")
                    if location not in {"bottom-center", "bottom-left", "bottom-right", "top-center"}:
                        raise ValueError("Choose a supported number position.")
                    for offset, i in enumerate(indices):
                        page = doc[i]
                        label = str(start+offset)
                        width = fitz.get_text_length(label, fontsize=11)
                        x = 24 if location == "bottom-left" else page.rect.width - width - 24 if location == "bottom-right" else (page.rect.width-width)/2
                        y = 26 if location == "top-center" else page.rect.height - 20
                        page.insert_text((x, y), label, fontsize=11, color=(0.25, 0.25, 0.25))
                elif slug == "watermark-pdf":
                    label = options.get("text", "").strip()
                    if not label or len(label) > 120:
                        raise ValueError("Enter a watermark of 1–120 characters.")
                    opacity = number(options, "opacity", 0.2, 0.1, 1)
                    for i in indices:
                        page = doc[i]
                        size = min(44, (page.rect.width - 48) / max(1, fitz.get_text_length(label, fontsize=1)))
                        width = fitz.get_text_length(label, fontsize=size)
                        page.insert_text(((page.rect.width-width)/2, page.rect.height/2), label,
                                         fontsize=size, color=(0.35, 0.35, 0.35), fill_opacity=opacity)
                else:
                    margin = number(options, "margin", 24, 0, 1000)
                    for i in indices:
                        page = doc[i]
                        if 2*margin >= min(page.cropbox.width, page.cropbox.height):
                            raise ValueError("The crop margin would remove the whole page.")
                        page.set_cropbox(page.cropbox + (margin, margin, -margin, -margin))
                    warnings.append("Cropping hides content; it is not redaction.")
                data = saved(doc)
            elif slug == "edit-pdf":
                page, x, y = selected_page(doc, options)
                value = options.get("text", "").strip()
                if not value or len(value) > 5000:
                    raise ValueError("Enter 1–5,000 characters of text.")
                size = number(options, "fontSize", 16, 6, 72)
                remaining = page.insert_htmlbox(fitz.Rect(x, max(0, y-size), page.rect.width-16, page.rect.height-16),
                                               "<div>" + __import__("html").escape(value).replace("\n", "<br>") + "</div>",
                                               css=f"* {{font-size:{size}pt;font-family:sans-serif;}}", scale_low=1)
                if remaining[0] < 0:
                    raise ValueError("The text does not fit at these coordinates. Use a smaller font or move it.")
                data = saved(doc)
                warnings.append("New text was added; original text was not rewritten.")
            elif slug == "pdf-forms":
                try:
                    values = json.loads(options.get("fields", "{}"))
                except json.JSONDecodeError:
                    raise ValueError("Form fields must be a JSON object of field names and values.")
                if not isinstance(values, dict) or not values:
                    raise ValueError("This action needs at least one actual form field value.")
                found = set()
                for page in doc:
                    for widget in page.widgets() or []:
                        if widget.field_name in values:
                            value = values[widget.field_name]
                            if widget.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                                widget.field_value = widget.on_state() if str(value).lower() in {"true", "1", "yes", "on"} else "Off"
                            else:
                                widget.field_value = str(value)
                            widget.update()
                            found.add(widget.field_name)
                if set(values) - found:
                    raise ValueError("Some named fields do not exist in this document: " + ", ".join(sorted(set(values)-found))[:200])
                data = saved(doc)
                message = f"Filled {len(found)} actual named form fields."
            elif slug == "unlock-pdf":
                data = doc.tobytes(garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_NONE)
                message = "Removed encryption using the supplied source password."
            elif slug == "protect-pdf":
                secret = options.get("password", "")
                if not 8 <= len(secret) <= 100:
                    raise ValueError("Choose an opening password of 8–100 characters.")
                data = doc.tobytes(garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_AES_256,
                                  owner_pw=secret, user_pw=secret)
                with fitz.open(stream=data, filetype="pdf") as locked:
                    if not locked.needs_pass or not locked.authenticate(secret):
                        raise RuntimeError("Encryption validation failed; no output was returned.")
                message = "Encrypted with AES-256. This PDF requires your password to open."
            elif slug == "sign-pdf":
                page, x, y = selected_page(doc, options)
                if len(paths) == 2:
                    if paths[1].suffix.lower() != ".png":
                        raise ValueError("Upload a PNG signature image.")
                    rect = fitz.Rect(x, y, min(x+200, page.rect.width-10), min(y+75, page.rect.height-10))
                    if rect.width < 20 or rect.height < 10:
                        raise ValueError("Move the signature away from the page edge.")
                    page.insert_image(rect, filename=str(paths[1]))
                else:
                    value = options.get("signatureText", "").strip()
                    if not 1 <= len(value) <= 100:
                        raise ValueError("Type a signature name or upload a signature PNG.")
                    page.insert_htmlbox(fitz.Rect(x, max(0,y-20), min(x+350,page.rect.width-10), min(y+65,page.rect.height-10)),
                                        "<i>" + __import__("html").escape(value) + "</i>",
                                        css="* {font-size:26pt;font-family:serif;color:#173865;}")
                data = saved(doc)
                warnings.append("This is a visual basic electronic signature, not a certificate-backed digital signature or identity verification.")
            elif slug == "redact-pdf":
                term = options.get("redactText", "").strip()
                try:
                    rectangles = json.loads(options.get("rectangles", "[]") or "[]")
                except json.JSONDecodeError:
                    raise ValueError("Rectangle areas must be valid JSON.")
                if not isinstance(rectangles, list) or len(rectangles) > 200 or (not term and not rectangles):
                    raise ValueError("Enter text to remove or up to 200 valid rectangle areas.")
                matches = 0
                for page in doc:
                    if term:
                        for rect in page.search_for(term):
                            page.add_redact_annot(rect, fill=(0, 0, 0))
                            matches += 1
                for area in rectangles:
                    if not isinstance(area, dict):
                        raise ValueError("Each rectangle needs page, x, y, width and height.")
                    area_page = number(area, "page", 1, 1, len(doc), integer=True) - 1
                    page = doc[area_page]
                    x = number(area, "x", 0, 0, page.rect.width)
                    y = number(area, "y", 0, 0, page.rect.height)
                    w = number(area, "width", 0, 1, page.rect.width)
                    h = number(area, "height", 0, 1, page.rect.height)
                    rect = fitz.Rect(x, y, x+w, y+h)
                    if not page.rect.contains(rect):
                        raise ValueError("A rectangle extends outside the selected page.")
                    page.add_redact_annot(rect, fill=(0, 0, 0))
                    matches += 1
                if not matches:
                    raise ValueError("No matching text was found. Nothing was redacted. Use a rectangle for unusual text encoding.")
                for page in doc:
                    page.apply_redactions(images=2, graphics=2, text=0)
                doc.set_metadata({})
                doc.del_xml_metadata()
                for name in doc.embfile_names():
                    doc.embfile_del(name)
                data = saved(doc)
                message = f"Permanently removed {matches} matching text occurrences or selected areas."
                warnings.append("Metadata and embedded attachments were removed. Inspect the whole output for confidential content, including unusual text encodings.")
            elif slug == "compare-pdf":
                if len(paths) != 2:
                    raise ValueError("Upload exactly two PDFs to compare.")
                with open_pdf(paths[1], options.get("password", "")) as other:
                    data, text, count = intelligence.compare(doc, other)
                extension = ".zip"
                message = "Actual text and rendered-page differences are in the comparison ZIP."
            elif slug == "ai-summarizer":
                text = intelligence.summarize(doc, options)
                data = text.encode("utf-8")
                extension = ".txt"
                message = "Extractive summary generated locally from your document's actual sentences."
                warnings.append("This selects source sentences. It is not a generative analysis, advice or a fact check.")
            elif slug == "translate-pdf":
                text, data, count = intelligence.translate(doc, options)
                message = "English text translated using the installed offline language model."
                warnings.append("Translated text is reflowed into a new document, not mapped onto the original layout. Review machine translations carefully.")
            elif slug == "pdf-to-markdown":
                text = intelligence.markdown(doc)
                data, extension = text.encode("utf-8"), ".md"
            else:
                raise ValueError("Unknown document tool.")
        finally:
            doc.close()
    if data is not None:
        if extension == ".pdf":
            with fitz.open(stream=data, filetype="pdf") as verify:
                if not verify.is_pdf or not len(verify):
                    raise RuntimeError("The generated PDF could not be validated.")
                if not verify.needs_pass:
                    count = len(verify)
        files.append(output(slug + extension, data))
    if not files:
        raise RuntimeError("The processor did not produce a file.")
    return {"files": files, "message": message, "warnings": warnings, "originalBytes": original,
            "outputBytes": sum(f["bytes"] for f in files), "pageCount": count, "text": text}


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            response = process(request)
        print(json.dumps({"ok": True, "result": response}, ensure_ascii=False))
    except (ValueError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error),
                          "status": 503 if isinstance(error, RuntimeError) else 400}))
    except Exception:
        # Don't expose paths, document contents, passwords or native engine diagnostics.
        print(json.dumps({"ok": False, "error": "The local processor could not read or transform this file. Check its format, password and options.", "status": 400}))