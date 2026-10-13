import csv
import hashlib
import html
import io
import json
import math
import re
from urllib.parse import urlparse

import pymupdf as fitz
from PIL import Image, ImageOps
from common import MAX_PAGES, number, open_pdf, page_list, saved, zip_outputs
from extra_common import contact_sheet, csv_data, finish, html_document, json_bytes, safe_name

TOOLS = set("""pdf-to-png pdf-to-webp pdf-to-svg pdf-to-text pdf-to-html pdf-to-json extract-images
extract-attachments extract-bookmarks pdf-metadata set-pdf-metadata remove-pdf-metadata flatten-pdf
remove-annotations remove-pdf-links reverse-pdf extract-pages duplicate-pages odd-pages even-pages
remove-blank-pages remove-duplicate-pages resize-pdf grayscale-pdf invert-pdf add-blank-pages
n-up-pdf booklet-pdf add-pdf-bookmarks add-pdf-link add-pdf-background extract-pdf-fonts
strip-pdf-attachments interleave-pdf pdf-contact-sheet pdf-to-csv pdf-word-count rasterize-pdf""".split())


def render(page,dpi):
    if page.rect.width*page.rect.height*(dpi/72)**2 > 25_000_000:
        raise ValueError("A page is too large at this resolution. Choose lower DPI or resize the source.")
    return page.get_pixmap(dpi=dpi,colorspace=fitz.csRGB,alpha=False)


def paper(options):
    size = options.get("size","A4")
    if size not in {"A4","Letter","A5"}:
        raise ValueError("Choose A4, Letter or A5.")
    w,h = fitz.paper_size(size)
    orientation = options.get("orientation","portrait")
    if orientation not in {"portrait","landscape"}:
        raise ValueError("Choose portrait or landscape.")
    return (h,w) if orientation=="landscape" else (w,h)


def select_copy(doc,indices):
    if not indices:
        raise ValueError("No pages match this selection.")
    if len(indices)>MAX_PAGES:
        raise ValueError("The output would exceed 1,000 pages.")
    result = fitz.open()
    for i in indices:
        result.insert_pdf(doc,from_page=i,to_page=i,widgets=True)
    return result


def process(slug,paths,options):
    with open_pdf(paths[0],options.get("password","")) as doc:
        indices = page_list(options.get("pages",""),len(doc))
        count,extension,text,warnings,message = len(indices),".pdf","",[],"Your file is ready."
        result = None
        if slug in {"pdf-to-png","pdf-to-webp","pdf-to-svg"}:
            if len(indices)>100:
                raise ValueError("Image/SVG exports are limited to 100 selected pages.")
            extension = ".zip"
            fmt = slug.removeprefix("pdf-to-")
            dpi = number(options,"dpi",144,72,200,integer=True)
            quality = number(options,"quality",85,1,100,integer=True)
            parts = []
            for i in indices:
                if fmt=="svg":
                    data = doc[i].get_svg_image(text_as_path=True).encode()
                else:
                    pixmap = render(doc[i],dpi)
                    if fmt=="png":
                        data = pixmap.tobytes("png")
                    else:
                        image = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples)
                        buffer = io.BytesIO()
                        image.save(buffer,"WEBP",quality=quality)
                        data = buffer.getvalue()
                parts.append((f"page-{i+1:04d}.{fmt}",data))
            data = zip_outputs(parts)
        elif slug in {"pdf-to-text","pdf-to-html","pdf-to-json","pdf-word-count"}:
            pages = [{"page":i+1,"width":doc[i].rect.width,"height":doc[i].rect.height,"text":doc[i].get_text(sort=True)} for i in indices]
            combined = "\n\n".join(p["text"] for p in pages)
            if slug!="pdf-to-json" and not combined.strip():
                raise ValueError("No extractable text was found. Use OCR first for scans.")
            if slug=="pdf-to-text":
                text = combined
                data,extension = combined.encode(),".txt"
            elif slug=="pdf-to-html":
                content = "".join(f'<section><h2>Page {p["page"]}</h2><p>{html.escape(p["text"]).replace(chr(10),"<br>")}</p></section>' for p in pages)
                data,extension = html_document(content,"Extracted PDF text").encode(),".html"
            elif slug=="pdf-to-json":
                data,extension = json_bytes({"metadata":doc.metadata,"sourcePageCount":len(doc),"pages":pages}),".json"
            else:
                data = json_bytes({"selectedPages":len(indices),"words":len(combined.split()),"characters":len(combined),
                                   "perPage":[{"page":p["page"],"words":len(p["text"].split()),"characters":len(p["text"])} for p in pages]})
                extension,text = ".json",data.decode()
        elif slug in {"extract-images","extract-attachments","extract-pdf-fonts"}:
            parts,seen = [],set()
            if slug=="extract-images":
                for i in indices:
                    for item in doc[i].get_images(full=True):
                        xref = item[0]
                        if xref in seen:
                            continue
                        seen.add(xref)
                        image = doc.extract_image(xref)
                        if image:
                            parts.append((f"image-{xref}.{safe_name(image['ext'])}",image["image"]))
            elif slug=="extract-attachments":
                for i,name in enumerate(doc.embfile_names()):
                    parts.append((f"{i+1}-{safe_name(name)}",doc.embfile_get(name)))
            else:
                for page in doc:
                    for item in page.get_fonts(full=True):
                        if item[0] in seen:
                            continue
                        seen.add(item[0])
                        name,ext,_type,content = doc.extract_font(item[0])
                        if content:
                            parts.append((f"{item[0]}-{safe_name(name)}.{safe_name(ext)}",content))
            if not parts:
                raise ValueError("No extractable embedded "+("images" if slug=="extract-images" else "attachments" if slug=="extract-attachments" else "fonts")+" were found.")
            data,extension = zip_outputs(parts),".zip"
        elif slug in {"extract-bookmarks","pdf-metadata"}:
            info = {"bookmarks":doc.get_toc()} if slug=="extract-bookmarks" else {
                "metadata":doc.metadata,"pageCount":len(doc),"attachments":doc.embfile_names(),
                "fonts":sorted(set(font[3] for page in doc for font in page.get_fonts()))}
            data,extension = json_bytes(info),".json"
            text = data.decode()
        elif slug in {"set-pdf-metadata","remove-pdf-metadata"}:
            metadata = dict(doc.metadata) if slug=="set-pdf-metadata" else {}
            if slug=="set-pdf-metadata":
                for key in ["title","author","subject","keywords"]:
                    metadata[key] = options.get(key,"")[:2000]
            doc.set_metadata(metadata)
            doc.del_xml_metadata()
            data = saved(doc)
            warnings.append("Visible page content, annotations and attachments are not removed by metadata editing.")
        elif slug=="flatten-pdf":
            doc.bake(annots=True,widgets=True)
            data = saved(doc)
            warnings.append("Forms and annotations are now page content and are no longer interactive.")
        elif slug in {"remove-annotations","remove-pdf-links"}:
            removed = 0
            for i in indices:
                page = doc[i]
                if slug=="remove-annotations":
                    for annot in list(page.annots() or []):
                        page.delete_annot(annot)
                        removed += 1
                else:
                    for link in page.get_links():
                        page.delete_link(link)
                        removed += 1
            data = saved(doc)
            message = f"Removed {removed} "+("annotations." if slug=="remove-annotations" else "clickable links.")
        elif slug in {"reverse-pdf","extract-pages","duplicate-pages","odd-pages","even-pages"}:
            if slug=="reverse-pdf":
                chosen = list(reversed(range(len(doc))))
            elif slug=="extract-pages":
                chosen = indices
            elif slug=="duplicate-pages":
                selection = set(page_list(options.get("pages","1"),len(doc),required=True))
                chosen = [i for i in range(len(doc)) for _ in range(2 if i in selection else 1)]
            else:
                chosen = list(range(0 if slug=="odd-pages" else 1,len(doc),2))
            result = select_copy(doc,chosen)
            data,count = saved(result),len(result)
        elif slug in {"remove-blank-pages","remove-duplicate-pages"}:
            if len(doc)>200:
                raise ValueError("This inspection is limited to 200 pages.")
            chosen,seen = [],set()
            tolerance = number(options,"tolerance",0.02,0,2)/100
            for i,page in enumerate(doc):
                pixmap = render(page,72)
                if slug=="remove-duplicate-pages":
                    digest = hashlib.sha256(f"{pixmap.width},{pixmap.height}".encode()+pixmap.samples).digest()
                    keep = digest not in seen
                    seen.add(digest)
                else:
                    gray = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples).convert("L")
                    nonwhite = sum(gray.histogram()[:245])/(gray.width*gray.height)
                    keep = bool(page.get_text().strip() or list(page.widgets() or []) or list(page.annots() or []) or page.get_links() or nonwhite>tolerance)
                if keep:
                    chosen.append(i)
            result = select_copy(doc,chosen)
            data,count = saved(result),len(result)
            message = f"Removed {len(doc)-count} pages; retained {count}."
            warnings.append("Review the retained pages and keep your original, especially for faint marks or hidden content.")
        elif slug in {"resize-pdf","n-up-pdf","booklet-pdf"}:
            doc.bake(annots=True,widgets=True)
            result = fitz.open()
            if slug=="booklet-pdf":
                w,h = fitz.paper_size("A4")
                w,h = h,w
                total = math.ceil(len(doc)/4)*4
                groups = []
                for i in range(total//4):
                    groups += [[total-1-2*i,2*i],[2*i+1,total-2-2*i]]
                columns,rows,margin = 2,1,12
            else:
                w,h = paper(options)
                per_sheet = number(options,"perSheet",4,2,9,integer=True) if slug=="n-up-pdf" else 1
                if slug=="n-up-pdf" and per_sheet not in {2,4,6,9}:
                    raise ValueError("Choose 2, 4, 6 or 9 pages per sheet.")
                columns = math.ceil(math.sqrt(per_sheet))
                rows = math.ceil(per_sheet/columns)
                margin = number(options,"margin",18,0,100)
                groups = [list(range(i,min(i+per_sheet,len(doc)))) for i in range(0,len(doc),per_sheet)]
            for group in groups:
                out = result.new_page(width=w,height=h)
                cellw,cellh = (w-2*margin)/columns,(h-2*margin)/rows
                for position,i in enumerate(group):
                    if i>=len(doc):
                        continue
                    x,y = margin+(position%columns)*cellw,margin+(position//columns)*cellh
                    out.show_pdf_page(fitz.Rect(x+3,y+3,x+cellw-3,y+cellh-3),doc,i,keep_proportion=True)
            data,count = saved(result),len(result)
            warnings.append("Interactive elements are flattened into visible content; original links and fields are not retained.")
        elif slug in {"grayscale-pdf","invert-pdf","rasterize-pdf"}:
            if len(doc)>100:
                raise ValueError("Raster conversion is limited to 100 pages.")
            result = fitz.open()
            dpi = number(options,"dpi",144,72,200,integer=True)
            for page in doc:
                pixmap = render(page,dpi)
                image = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples)
                if slug=="grayscale-pdf":
                    image = ImageOps.grayscale(image)
                elif slug=="invert-pdf":
                    image = ImageOps.invert(image)
                buffer = io.BytesIO()
                image.save(buffer,"PNG")
                out = result.new_page(width=page.rect.width,height=page.rect.height)
                out.insert_image(out.rect,stream=buffer.getvalue())
            data = saved(result)
            warnings.append("Image-only PDF: original searchable text, form fields, links and signatures are not retained.")
        elif slug=="add-blank-pages":
            after = number(options,"after",0,0,len(doc),integer=True)
            added = number(options,"count",1,1,100,integer=True)
            if len(doc)+added>MAX_PAGES:
                raise ValueError("The output would exceed 1,000 pages.")
            w,h = paper(options)
            for i in range(added):
                doc.new_page(pno=after+i,width=w,height=h)
            data,count = saved(doc),len(doc)
        elif slug=="add-pdf-bookmarks":
            toc = []
            for line in options.get("bookmarks","").splitlines():
                if not line.strip():
                    continue
                parts = line.split("|",1)
                if len(parts)!=2 or not parts[1].strip():
                    raise ValueError("Each bookmark must be page number|title.")
                index = number({"page":parts[0]},"page",1,1,len(doc),integer=True)
                toc.append([1,parts[1].strip()[:300],index])
            if not toc or len(toc)>500:
                raise ValueError("Enter between 1 and 500 bookmarks.")
            doc.set_toc(toc)
            data = saved(doc)
        elif slug=="add-pdf-link":
            index = number(options,"page",1,1,len(doc),integer=True)-1
            page = doc[index]
            x = number(options,"x",50,0,page.rect.width)
            y = number(options,"y",100,0,page.rect.height)
            w = number(options,"width",150,1,page.rect.width)
            h = number(options,"height",30,1,page.rect.height)
            rect = fitz.Rect(x,y,x+w,y+h)
            url = options.get("url","").strip()
            parsed = urlparse(url)
            if parsed.scheme not in {"http","https"} or not parsed.hostname or len(url)>2000:
                raise ValueError("Enter a valid HTTP or HTTPS URL.")
            if not page.rect.contains(rect):
                raise ValueError("The link rectangle extends outside the page.")
            page.insert_link({"kind":fitz.LINK_URI,"from":rect,"uri":url})
            data = saved(doc)
        elif slug=="add-pdf-background":
            value = options.get("color","#eeeeee")
            if not re.fullmatch(r"#[0-9a-fA-F]{6}",value):
                raise ValueError("Use a six-digit hex color.")
            rgb = tuple(int(value[i:i+2],16)/255 for i in (1,3,5))
            for i in indices:
                doc[i].draw_rect(doc[i].rect,color=None,fill=rgb,overlay=False)
            data = saved(doc)
        elif slug=="strip-pdf-attachments":
            names = doc.embfile_names()
            for name in names:
                doc.embfile_del(name)
            data = saved(doc)
            message = f"Removed {len(names)} document-level attachments."
        elif slug=="interleave-pdf":
            if len(paths)!=2:
                raise ValueError("Upload exactly two PDFs.")
            with open_pdf(paths[1],options.get("password","")) as other:
                if len(doc)+len(other)>MAX_PAGES:
                    raise ValueError("The output would exceed 1,000 pages.")
                result = fitz.open()
                for i in range(max(len(doc),len(other))):
                    for source in [doc,other]:
                        if i<len(source):
                            result.insert_pdf(source,from_page=i,to_page=i,widgets=True)
                data,count = saved(result),len(result)
        elif slug=="pdf-contact-sheet":
            if len(indices)>100:
                raise ValueError("Contact sheets are limited to 100 selected pages.")
            images = []
            for i in indices:
                page = doc[i]
                scale = min(200/page.rect.width,215/page.rect.height)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale,scale),colorspace=fitz.csRGB,alpha=False)
                images.append(Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples))
            data,extension = contact_sheet(images,[f"Page {i+1}" for i in indices],options),".png"
        elif slug=="pdf-to-csv":
            parts = []
            for i in indices:
                for n,table in enumerate(doc[i].find_tables().tables):
                    parts.append((f"page-{i+1}-table-{n+1}.csv",csv_data(table.extract())))
            if not parts:
                raise ValueError("No text-based tables were detected. Use OCR for scans or PDF to Text for unstructured content.")
            data,extension = zip_outputs(parts),".zip"
            warnings.append("Formula-like cells are escaped for safe opening in spreadsheet software.")
        else:
            raise ValueError("Unknown PDF tool.")
        if result is not None:
            result.close()
        return finish(slug,paths,data,extension,count,text,warnings,message)