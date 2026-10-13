import html
import io
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from PIL import Image
from common import MAX_OUTPUT, number, open_pdf, page_list, zip_outputs
from extra_common import csv_data, finish, json_bytes
from pdf_tools import render

TOOLS = set("""pdf-to-tiff pdf-to-bmp pdf-to-epub pdf-to-odt pdf-to-rtf export-pdf-comments
extract-pdf-links check-internal-pdf-links pdf-page-boxes""".split())


def xml(value):
    return html.escape(re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "\ufffd",str(value)))


def epub(pages,title,author):
    memory = io.BytesIO()
    identifier = "urn:uuid:"+str(uuid.uuid4())
    with zipfile.ZipFile(memory,"w") as archive:
        archive.writestr("mimetype","application/epub+zip",compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml",'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        items,spine,links = [],[],[]
        for i,record in enumerate(pages):
            name = f"chapter-{i+1}.xhtml"
            markup = ('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head>'
                      f'<title>Page {record["page"]}</title></head><body><h1>Page {record["page"]}</h1>'+
                      "".join("<p>"+xml(line)+"</p>" for line in record["text"].splitlines())+"</body></html>")
            archive.writestr("OEBPS/"+name,markup.encode(),compress_type=zipfile.ZIP_DEFLATED)
            items.append(f'<item id="c{i}" href="{name}" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="c{i}"/>')
            links.append(f'<li><a href="{name}">Page {record["page"]}</a></li>')
        nav = ('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
               '<head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>'+
               "".join(links)+"</ol></nav></body></html>")
        archive.writestr("OEBPS/nav.xhtml",nav,compress_type=zipfile.ZIP_DEFLATED)
        modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        creator = "<dc:creator>"+xml(author)+"</dc:creator>" if author else ""
        package = ('<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">'
                   '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
                   f'<dc:identifier id="book-id">{identifier}</dc:identifier><dc:title>{xml(title)}</dc:title><dc:language>und</dc:language>{creator}'
                   f'<meta property="dcterms:modified">{modified}</meta></metadata><manifest>'
                   '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+
                   "".join(items)+"</manifest><spine>"+"".join(spine)+"</spine></package>")
        archive.writestr("OEBPS/content.opf",package.encode(),compress_type=zipfile.ZIP_DEFLATED)
    return memory.getvalue()


def odt(pages):
    memory = io.BytesIO()
    paragraphs = []
    for i,record in enumerate(pages):
        style = ' text:style-name="SourcePage"' if i else ""
        paragraphs.append(f'<text:h text:outline-level="1"{style}>Page {record["page"]}</text:h>')
        paragraphs.extend("<text:p>"+xml(line)+"</text:p>" for line in record["text"].splitlines())
    content = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content '
               'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
               'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">'
               '<office:automatic-styles><style:style style:name="SourcePage" style:family="paragraph">'
               '<style:paragraph-properties fo:break-before="page"/></style:style></office:automatic-styles><office:body><office:text>'+
               "".join(paragraphs)+"</office:text></office:body></office:document-content>")
    manifest = ('<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
                '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
                '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
    with zipfile.ZipFile(memory,"w") as archive:
        archive.writestr("mimetype","application/vnd.oasis.opendocument.text",compress_type=zipfile.ZIP_STORED)
        archive.writestr("content.xml",content.encode(),compress_type=zipfile.ZIP_DEFLATED)
        archive.writestr("META-INF/manifest.xml",manifest,compress_type=zipfile.ZIP_DEFLATED)
    return memory.getvalue()


def rtf_text(value):
    out = []
    for char in value:
        if char in "\\{}":
            out.append("\\"+char)
        elif char=="\n":
            out.append("\\line ")
        elif char=="\r":
            continue
        elif ord(char)<128:
            out.append(char)
        else:
            encoded = char.encode("utf-16-le")
            for i in range(0,len(encoded),2):
                unit = int.from_bytes(encoded[i:i+2],"little")
                out.append("\\u"+str(unit if unit<32768 else unit-65536)+"?")
    return "".join(out)


def process(slug,paths,options):
    with open_pdf(paths[0],options.get("password","")) as doc:
        chosen = page_list(options.get("pages",""),len(doc))
        text,warnings = "",[]
        if slug in {"pdf-to-tiff","pdf-to-bmp"}:
            if len(chosen)>100:
                raise ValueError("Image exports are limited to 100 selected pages.")
            dpi = number(options,"dpi",144 if slug=="pdf-to-tiff" else 72,72,200,integer=True)
            parts,total = [],0
            for i in chosen:
                pixmap = render(doc[i],dpi)
                if slug=="pdf-to-bmp" and total+pixmap.width*pixmap.height*3>MAX_OUTPUT:
                    raise ValueError("Uncompressed bitmap output exceeds 80 MB. Use fewer pages or lower DPI.")
                image = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples)
                buffer = io.BytesIO()
                fmt = "TIFF" if slug=="pdf-to-tiff" else "BMP"
                image.save(buffer,fmt,**({"compression":"tiff_deflate"} if fmt=="TIFF" else {}))
                data = buffer.getvalue()
                total += len(data)
                if total>MAX_OUTPUT:
                    raise ValueError("Image outputs exceed 80 MB. Use fewer pages or lower DPI.")
                parts.append((f"page-{i+1:04d}."+fmt.lower(),data))
            data,extension = zip_outputs(parts),".zip"
        elif slug in {"pdf-to-epub","pdf-to-odt","pdf-to-rtf"}:
            records = [{"page":i+1,"text":doc[i].get_text(sort=True)} for i in chosen]
            if not any(r["text"].strip() for r in records):
                raise ValueError("No extractable text was found. Use OCR first for scans.")
            if slug=="pdf-to-epub":
                data,extension = epub(records,options.get("title","PDF ebook")[:200],doc.metadata.get("author","")),".epub"
            elif slug=="pdf-to-odt":
                data,extension = odt(records),".odt"
            else:
                content = "\\page ".join(rtf_text(r["text"]) for r in records)
                data,extension = ("{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0 Arial;}}\\f0\\fs22 "+content+"}").encode("ascii"),".rtf"
            warnings.append("Text is reflowed. Source images, forms and exact graphical layout are not retained.")
        elif slug=="export-pdf-comments":
            records = []
            for i in chosen:
                for annot in doc[i].annots() or []:
                    info = annot.info
                    records.append({"page":i+1,"type":annot.type[1],"content":info.get("content",""),
                                    "author":info.get("title",""),"subject":info.get("subject",""),"rect":list(annot.rect)})
            if not records:
                raise ValueError("No annotations were found on the selected pages.")
            format = options.get("format","json")
            if format=="json":
                data,extension = json_bytes({"annotations":records}),".json"
                text = data.decode()
            elif format=="csv":
                data,extension = csv_data([["page","type","author","subject","content"]]+
                                         [[r["page"],r["type"],r["author"],r["subject"],r["content"]] for r in records]),".csv"
            else:
                raise ValueError("Choose json or csv.")
        else:
            records = []
            for i in chosen:
                page = doc[i]
                if slug=="pdf-page-boxes":
                    records.append({"page":i+1,"rotation":page.rotation,"label":page.get_label(),
                                    **{name:list(getattr(page,name)) for name in ["mediabox","cropbox","trimbox","bleedbox","artbox"]}})
                elif slug in {"extract-pdf-links","check-internal-pdf-links"}:
                    for link in page.get_links():
                        destination = link.get("page",-1)
                        record = {"page":i+1,"kind":link["kind"],"rect":list(link["from"]),
                                  "targetPage":destination+1 if destination>=0 else None,"url":link.get("uri"),
                                  "file":link.get("file")}
                        if slug=="check-internal-pdf-links":
                            record["status"] = ("valid" if 0<=destination<len(doc) else "out-of-range") if link["kind"]==1 else "not-verified"
                        records.append(record)
                else:
                    raise ValueError("Unknown PDF export tool.")
            data,extension = json_bytes({"records":records}),".json"
            text = data.decode()
            if slug=="check-internal-pdf-links":
                warnings.append("External availability and named destinations are not verified. Only direct internal page links are checked.")
        return finish(slug,paths,data,extension,len(chosen),text,warnings)