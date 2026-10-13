import html
import math
import pymupdf as fitz
from common import MAX_PAGES, number, open_pdf, page_list, saved, zip_outputs
from extra_common import finish
from pdf_advanced_common import add_line, split_ranges

TOOLS = set("""split-by-bookmarks split-by-size split-by-text split-by-page-count overlay-pdf
pdf-headers-footers poster-pdf pdf-table-of-contents bates-numbering""".split())


def contents_entries(doc,value):
    if value.strip():
        entries = []
        for line in value.splitlines():
            if not line.strip():
                continue
            parts = line.split("|",1)
            if len(parts)!=2 or not parts[1].strip():
                raise ValueError("Each contents entry must be page number|title.")
            index = number({"page":parts[0]},"page",1,1,len(doc),integer=True)
            entries.append((index-1,parts[1].strip()[:500],1))
    else:
        entries = [(p-1,title,level) for level,title,p in doc.get_toc() if 1<=p<=len(doc)]
    if not 1<=len(entries)<=500:
        raise ValueError("Add 1–500 entries or upload a PDF with valid page bookmarks.")
    return entries


def bates(paths,options):
    counter = number(options,"start",1,1,999999999,integer=True)
    digits = number(options,"digits",6,1,12,integer=True)
    prefix = options.get("prefix","KTAS-")
    if len(prefix)>60:
        raise ValueError("Use a prefix of at most 60 characters.")
    parts,counts = [],0
    for index,path in enumerate(paths):
        with open_pdf(path,options.get("password","")) as doc:
            counts += len(doc)
            if counts>1000:
                raise ValueError("Bates numbering is limited to 1,000 total pages.")
            for page in doc:
                page.remove_rotation()
                add_line(page,prefix+str(counter).zfill(digits),footer=True,align="right")
                counter += 1
            parts.append((f"numbered-{index+1:02d}.pdf",saved(doc)))
    data,ext = (zip_outputs(parts),".zip") if len(parts)>1 else (parts[0][1],".pdf")
    return finish("bates-numbering",paths,data,ext,counts,
                  warnings=["Numbers are visual stamps, not a legal certification. Review overlap with existing content."])


def process(slug,paths,options):
    if slug=="bates-numbering":
        return bates(paths,options)
    with open_pdf(paths[0],options.get("password","")) as doc:
        count,ext,warnings = len(doc),".pdf",[]
        if slug in {"split-by-bookmarks","split-by-text","split-by-page-count"}:
            if slug=="split-by-bookmarks":
                level = number(options,"level",1,1,3,integer=True)
                starts = [p-1 for depth,_title,p in doc.get_toc() if depth==level and 1<=p<=len(doc)]
                if not starts:
                    raise ValueError("No bookmarks at the selected level were found.")
            elif slug=="split-by-text":
                needle = options.get("search","").strip()
                if not 1<=len(needle)<=300:
                    raise ValueError("Enter 1–300 characters to mark section starts.")
                matching = options.get("matching","ignore-case")
                if matching not in {"ignore-case","case-sensitive"}:
                    raise ValueError("Invalid text matching mode.")
                normalize = str.casefold if matching=="ignore-case" else lambda s:s
                starts = [i for i,p in enumerate(doc) if normalize(needle) in normalize(p.get_text(sort=True))]
                if not starts:
                    raise ValueError("The section-start text was not found. Scanned pages may need OCR.")
            else:
                group = number(options,"groupSize",10,1,1000,integer=True)
                starts = list(range(0,len(doc),group))
            data,ext = split_ranges(doc,starts),".zip"
        elif slug=="split-by-size":
            if len(doc)>200:
                raise ValueError("Size-based splitting is limited to 200 pages.")
            target = int(number(options,"maxMB",2,0.01,20)*1024*1024)
            parts,part,previous,start = [],fitz.open(),None,0
            try:
                for i in range(len(doc)):
                    part.insert_pdf(doc,from_page=i,to_page=i,widgets=True)
                    candidate = saved(part)
                    if len(candidate)>target and previous is not None:
                        parts.append((f"part-{len(parts)+1:03d}-pages-{start+1}-{i}.pdf",previous))
                        part.close()
                        part,start = fitz.open(),i
                        part.insert_pdf(doc,from_page=i,to_page=i,widgets=True)
                        candidate = saved(part)
                    if len(part)==1 and len(candidate)>target:
                        warnings.append(f"Page {i+1} alone is larger than the requested limit and is retained intact.")
                    previous = candidate
                parts.append((f"part-{len(parts)+1:03d}-pages-{start+1}-{len(doc)}.pdf",previous))
                data,ext = zip_outputs(parts),".zip"
            finally:
                part.close()
        elif slug=="overlay-pdf":
            if len(paths)!=2:
                raise ValueError("Upload exactly two PDFs: the source first, overlay second.")
            layer = options.get("layer","behind")
            if layer not in {"above","behind"}:
                raise ValueError("Choose above or behind.")
            with open_pdf(paths[1],options.get("password","")) as overlay:
                if len(overlay) not in {1,len(doc)}:
                    raise ValueError("The overlay must have one page or match the source page count.")
                overlay.bake(annots=True,widgets=True)
                for i,page in enumerate(doc):
                    page.remove_rotation()
                    source = 0 if len(overlay)==1 else i
                    if overlay[source].get_contents():
                        page.show_pdf_page(page.rect,overlay,source,overlay=layer=="above",keep_proportion=True)
                data = saved(doc)
            warnings.append("Opaque overlay backgrounds may cover original content. Overlay fields and annotations are flattened.")
        elif slug=="pdf-headers-footers":
            header,footer = options.get("header","").strip(),options.get("footer","").strip()
            if not header and not footer:
                raise ValueError("Enter a header or footer.")
            for i in page_list(options.get("pages",""),len(doc)):
                doc[i].remove_rotation()
                if header:
                    add_line(doc[i],header,align=options.get("align","center"))
                if footer:
                    add_line(doc[i],footer,footer=True,align=options.get("align","center"))
            data = saved(doc)
            warnings.append("Text is added inside the page; review overlap with existing content.")
        elif slug=="poster-pdf":
            chosen = page_list(options.get("pages",""),len(doc))
            columns = number(options,"columns",2,1,8,integer=True)
            rows = number(options,"rows",2,1,8,integer=True)
            if len(chosen)>100 or len(chosen)*columns*rows>MAX_PAGES:
                raise ValueError("Poster layout supports 100 source pages and 1,000 output sheets.")
            doc.bake(annots=True,widgets=True)
            with fitz.open() as out:
                for index in chosen:
                    rect = doc[index].rect
                    for row in range(rows):
                        for column in range(columns):
                            clip = fitz.Rect(rect.x0+column*rect.width/columns,rect.y0+row*rect.height/rows,
                                             rect.x0+(column+1)*rect.width/columns,rect.y0+(row+1)*rect.height/rows)
                            page = out.new_page(width=595,height=842)
                            if doc[index].get_contents():
                                page.show_pdf_page(fitz.Rect(18,18,577,800),doc,index,clip=clip,keep_proportion=True)
                            page.insert_text((18,825),f"Source page {index+1} | row {row+1}, column {column+1}",fontsize=9)
                data,count = saved(out),len(out)
            warnings.append("Forms and annotations are flattened. Print at actual size and trim the page margins.")
        elif slug=="pdf-table-of-contents":
            entries = contents_entries(doc,options.get("entries",""))
            per_page = 30
            extra = math.ceil(len(entries)/per_page)
            if len(doc)+extra>MAX_PAGES:
                raise ValueError("Adding contents pages would exceed 1,000 pages.")
            old_toc = doc.get_toc()
            metadata = doc.metadata
            with fitz.open() as out:
                for section in range(extra):
                    page = out.new_page(width=595,height=842)
                    page.insert_text((36,45),"Contents"+(f" ({section+1})" if section else ""),fontsize=20)
                    for n,(target,title,level) in enumerate(entries[section*per_page:(section+1)*per_page]):
                        y = 70+n*24
                        left = 36+min(level-1,4)*12
                        rect = fitz.Rect(left,y,560,y+22)
                        label = f"{title}  —  {target+extra+1}"
                        spare,_ = page.insert_htmlbox(rect,"<p>"+html.escape(label)+"</p>",
                                                     css="body{font-size:10pt} p{margin:0}",scale_low=0.3)
                        if spare<0:
                            raise ValueError("A contents title is too long to fit. Shorten the title.")
                out.insert_pdf(doc,widgets=True)
                for n,(target,_title,level) in enumerate(entries):
                    page = out[n//per_page]
                    y = 70+(n%per_page)*24
                    page.insert_link({"kind":fitz.LINK_GOTO,"from":fitz.Rect(36+min(level-1,4)*12,y,560,y+22),
                                      "page":target+extra,"to":fitz.Point(0,0)})
                out.set_metadata(metadata)
                valid_toc = [[1,"Contents",1]]
                for level,title,p in old_toc:
                    if 1<=p<=len(doc):
                        # Preserve valid outline hierarchy without gaps after filtering external entries.
                        depth = min(level,valid_toc[-1][0]+1)
                        valid_toc.append([depth,title,p+extra])
                out.set_toc(valid_toc)
                data,count = saved(out),len(out)
            warnings.append("External outline destinations are not copied. Contents page numbers reflect the final document.")
        else:
            raise ValueError("Unknown PDF layout tool.")
        return finish(slug,paths,data,ext,count,warnings=warnings)