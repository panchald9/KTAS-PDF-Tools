"""Real Office/image/archive conversions through local engines."""
import html
import io
import os
import re
import shutil
import zipfile
from pathlib import Path

import pymupdf as fitz
from bs4 import BeautifulSoup
from docx import Document
from docx.shared import Inches as WordInches
from openpyxl import Workbook
from PIL import Image, ImageCms
from pptx import Presentation
from pptx.util import Inches
from pypdf import PdfReader

from common import html_pdf, number, page_list, run, saved, zip_outputs


def office_to_pdf(path, work):
    # Private profile per invocation: no shared user state, and default macro execution is disabled.
    profile = work / "office-profile"
    out = work / "office-output"
    out.mkdir()
    run(["libreoffice", "-env:UserInstallation=" + profile.as_uri(), "--headless",
         "--convert-to", "pdf", "--outdir", str(out), str(path)], timeout=120)
    result = out / (path.stem + ".pdf")
    if not result.is_file():
        raise ValueError("LibreOffice did not produce a PDF. Check the input file and print settings.")
    doc = fitz.open(result)
    if not len(doc):
        raise ValueError("The office document has no printable content.")
    return result.read_bytes(), len(doc)


def html_to_pdf(path):
    source = path.read_bytes()
    if len(source) > 2 * 1024 * 1024:
        raise ValueError("HTML documents are limited to 2 MB.")
    soup = BeautifulSoup(source, "html.parser")
    for element in soup(["script", "iframe", "object", "embed", "link", "img", "base", "style", "audio", "video"]):
        element.decompose()
    for element in soup.find_all(True):
        element.attrs = {k: v for k, v in element.attrs.items()
                         if k in {"colspan", "rowspan", "class", "id"}}
    return html_pdf(str(soup))


def jpg(doc, options):
    pages = page_list(options.get("pages", ""), len(doc))
    if len(pages) > 100:
        raise ValueError("Image rendering is limited to 100 pages per request.")
    dpi = number(options, "dpi", 144, 72, 200, integer=True)
    files = []
    for i in pages:
        page = doc[i]
        if page.rect.width * page.rect.height * (dpi / 72) ** 2 > 30_000_000:
            raise ValueError("A page is too large to render at this resolution. Choose a lower DPI.")
        files.append((f"page-{i+1:04d}.jpg", page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB).tobytes("jpeg", jpg_quality=90)))
    return zip_outputs(files)


def word(doc):
    result = Document()
    for i, page in enumerate(doc):
        if i:
            result.add_page_break()
        text = page.get_text(sort=True).strip()
        if text:
            for paragraph in re.split(r"\n\s*\n", text):
                result.add_paragraph(paragraph)
            for image in page.get_images(full=True)[:20]:
                try:
                    data = doc.extract_image(image[0])["image"]
                    result.add_picture(io.BytesIO(data), width=WordInches(5.8))
                except (ValueError, KeyError):
                    # Unsupported image encodings are represented by the full page below.
                    result.add_paragraph("[An embedded image could not be extracted.]")
        else:
            result.add_picture(io.BytesIO(page.get_pixmap(dpi=110).tobytes("png")), width=WordInches(6))
    buffer = io.BytesIO()
    result.save(buffer)
    return buffer.getvalue()


def powerpoint(doc):
    if len(doc) > 100:
        raise ValueError("PowerPoint conversion is limited to 100 pages.")
    deck = Presentation()
    width, height = doc[0].rect.width, doc[0].rect.height
    deck.slide_width = Inches(10)
    deck.slide_height = Inches(10 * height / width)
    for page in doc:
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        image = page.get_pixmap(dpi=110).tobytes("png")
        # Preserve appearance, fitting rather than stretching pages with different dimensions.
        ratio = min(deck.slide_width / page.rect.width, deck.slide_height / page.rect.height)
        w, h = int(page.rect.width * ratio), int(page.rect.height * ratio)
        slide.shapes.add_picture(io.BytesIO(image), (deck.slide_width-w)//2, (deck.slide_height-h)//2, width=w, height=h)
    buffer = io.BytesIO()
    deck.save(buffer)
    return buffer.getvalue()


def excel(doc):
    workbook = Workbook()
    workbook.remove(workbook.active)
    count = 0
    for i, page in enumerate(doc):
        tables = page.find_tables()
        for n, table in enumerate(tables.tables):
            sheet = workbook.create_sheet(f"Page {i+1} table {n+1}")
            for row in table.extract():
                # Write source text literally, never as executable spreadsheet formulas.
                sheet.append([("'" + x if isinstance(x, str) and x[:1] in "=+-@" else x) for x in row])
            count += 1
    if not count:
        sheet = workbook.create_sheet("Extracted page text")
        sheet.append(["Page", "Text"])
        for i, page in enumerate(doc):
            for line in page.get_text(sort=True).splitlines():
                sheet.append([i+1, "'" + line if line[:1] in "=+-@" else line])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue(), count


def ocr(path, work):
    source = fitz.open(path)
    if not source.is_pdf:
        pdf = source.convert_to_pdf()
        source.close()
        source = fitz.open(stream=pdf, filetype="pdf")
    if source.needs_pass:
        raise ValueError("Unlock this PDF before running OCR.")
    if len(source) > 50:
        raise ValueError("OCR is limited to 50 pages per request.")
    result = fitz.open()
    for i, page in enumerate(source):
        if page.rect.width * page.rect.height > 1_000_000:
            raise ValueError("A source page is too large for OCR.")
        image = work / f"ocr-{i}.png"
        page.get_pixmap(dpi=180, colorspace=fitz.csRGB).save(image)
        target = work / f"recognized-{i}"
        run(["tesseract", str(image), str(target), "-l", "eng", "pdf"], timeout=90)
        with fitz.open(str(target) + ".pdf") as recognized:
            result.insert_pdf(recognized)
    return saved(result), len(result)


def pdfa(path, work):
    executable = shutil.which("gs")
    if not executable:
        raise RuntimeError("Ghostscript is not available.")
    profile = work / "srgb.icc"
    profile.write_bytes(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
    definition = work / "pdfa.ps"
    # Embed the ICC profile and a real output intent, not just a PDF/A label.
    definition.write_text(f"""
/ICCProfile ({profile}) def
[/_objdef {{icc_PDFA}} /type /stream /OBJ pdfmark
[{{icc_PDFA}} << /N 3 >> /PUT pdfmark
[{{icc_PDFA}} ICCProfile (r) file /PUT pdfmark
[/_objdef {{OutputIntent_PDFA}} /type /dict /OBJ pdfmark
[{{OutputIntent_PDFA}} << /Type /OutputIntent /S /GTS_PDFA1
/DestOutputProfile {{icc_PDFA}} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark
[{{Catalog}} << /OutputIntents [{{OutputIntent_PDFA}}] >> /PUT pdfmark
""")
    target = work / "archival.pdf"
    run([executable, "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
         "-dPDFA=2", "-dPDFACompatibilityPolicy=1", "-sColorConversionStrategy=RGB",
         "-dEmbedAllFonts=true", f"--permit-file-read={profile}",
         f"-sOutputFile={target}", str(definition), str(path)], timeout=150)
    data = target.read_bytes()
    reader = PdfReader(io.BytesIO(data))
    root_object = reader.trailer["/Root"]
    metadata = root_object.get("/Metadata")
    xmp = metadata.get_object().get_data() if metadata else b""
    if b"pdfaid:part" not in xmp or not root_object.get("/OutputIntents"):
        raise ValueError("The local engine could not produce the required archival identification and color profile.")
    return data, len(reader.pages)