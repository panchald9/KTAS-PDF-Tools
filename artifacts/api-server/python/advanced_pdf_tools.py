import json
import pymupdf as fitz
from common import number, open_pdf, page_list, saved
from extra_common import finish, safe_name
from pdf_advanced_common import array_option, spec_number

TOOLS = {"highlight-pdf-text","add-pdf-attachments","remove-pdf-bookmarks","pdf-page-labels","set-pdf-print-boxes"}


def process(slug,paths,options):
    with open_pdf(paths[0],options.get("password","")) as doc:
        warnings,text = [],""
        if slug=="highlight-pdf-text":
            needle = options.get("search","").strip()
            if not 1<=len(needle)<=300:
                raise ValueError("Enter 1–300 characters to highlight.")
            hits = 0
            for i in page_list(options.get("pages",""),len(doc)):
                page = doc[i]
                quads = page.search_for(needle,quads=True)
                if hits+len(quads)>2000:
                    raise ValueError("There are over 2,000 matches. Select fewer pages or a more specific phrase.")
                for quad in quads:
                    annot = page.add_highlight_annot(quad)
                    annot.set_colors(stroke=(1,0.85,0))
                    annot.set_opacity(0.4)
                    annot.update()
                hits += len(quads)
            if not hits:
                raise ValueError("The text was not found. Scanned pages may need OCR first.")
            text = f"Highlighted {hits} matches."
            warnings.append("Highlights do not remove confidential content. Use Redact PDF for permanent removal.")
        elif slug=="add-pdf-attachments":
            if not 2<=len(paths)<=20:
                raise ValueError("Upload the destination PDF first and 1–19 attachment files.")
            try:
                names = json.loads(options.get("attachmentNames","[]"))
            except ValueError:
                raise ValueError("Invalid attachment names.")
            if not isinstance(names,list) or (names and len(names)!=len(paths)-1) or not all(isinstance(n,str) for n in names):
                raise ValueError("Attachment names must match the uploaded files.")
            used = set(doc.embfile_names())
            for i,path in enumerate(paths[1:]):
                name = safe_name(names[i] if names else path.name)
                original = name
                suffix = 1
                while name in used:
                    name = f"{suffix}-{original}"
                    suffix += 1
                used.add(name)
                doc.embfile_add(name,path.read_bytes(),filename=name,desc="Uploaded supporting file")
            text = f"Embedded {len(paths)-1} supporting files."
            warnings.append("Attachments are embedded without execution. Open only trusted files; names are sanitized and made unique.")
        elif slug=="remove-pdf-bookmarks":
            count = len(doc.get_toc())
            doc.set_toc([])
            text = f"Removed {count} outline entries; page content is unchanged."
        elif slug=="pdf-page-labels":
            specs = array_option(options,"rules",100)
            rules,seen = [],set()
            for spec in specs:
                page = spec_number(spec,"page",1,1,len(doc),integer=True)-1
                start = spec_number(spec,"start",1,1,999999999,integer=True)
                style,prefix = spec.get("style","D"),spec.get("prefix","")
                if style not in {"D","r","R","a","A",""} or not isinstance(prefix,str) or len(prefix)>100:
                    raise ValueError("Use label style D/r/R/a/A or empty, and a short text prefix.")
                if page in seen:
                    raise ValueError("Label rule starting pages must be unique.")
                seen.add(page)
                rules.append({"startpage":page,"prefix":prefix,"style":style,"firstpagenum":start})
            rules.sort(key=lambda r:r["startpage"])
            if rules[0]["startpage"]!=0:
                raise ValueError("The first label rule must begin on page 1.")
            doc.set_page_labels(rules)
            warnings.append("Viewer labels were set. Visible printed page numbers remain unchanged.")
        elif slug=="set-pdf-print-boxes":
            inset = number(options,"inset",9,0,200)
            box = options.get("box","trim")
            if box not in {"trim","bleed"}:
                raise ValueError("Choose trim or bleed.")
            for i in page_list(options.get("pages",""),len(doc)):
                page = doc[i]
                current = page.cropbox
                rect = fitz.Rect(current.x0+inset,current.y0+inset,current.x1-inset,current.y1-inset)
                if rect.is_empty or rect.width<1 or rect.height<1:
                    raise ValueError("The inset is too large for a selected page.")
                if box=="trim":
                    page.set_trimbox(rect)
                else:
                    page.set_bleedbox(rect)
            warnings.append("Print geometry only: this does not add bleed artwork or certify print compliance.")
        else:
            raise ValueError("Unknown advanced PDF tool.")
        return finish(slug,paths,saved(doc),".pdf",len(doc),text,warnings)