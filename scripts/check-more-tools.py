"""Validate the additional PDF tools against actual synthetic file contents."""
import base64
import contextlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

import pymupdf as fitz
from PIL import Image, PngImagePlugin

root = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root / "artifacts/api-server/python"))
from worker import process
from pdf_tools import TOOLS as PDF_TOOLS

catalog = (root / "artifacts/api-server/src/lib/more-tool-catalog.ts").read_text()
slugs = re.findall(r'^\s*\["([^"]+)"',catalog,re.M)
assert len(slugs)==38 and len(set(slugs))==38
assert set(slugs)==PDF_TOOLS, "UI and processing registry must agree."


with tempfile.TemporaryDirectory(prefix="ktas-more-check-") as temporary:
    work = Path(temporary)
    image_path = work / "image.png"
    image = Image.new("RGB",(320,400))
    pixels = image.load()
    for y in range(400):
        for x in range(320):
            pixels[x,y] = (x%256,y%256,(x+y)%256)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Comment","Private fixture comment")
    image.save(image_path,pnginfo=metadata)
    doc = fitz.open()
    first = doc.new_page()
    first.insert_text((30,40),"FIRST PAGE: Actual source text.")
    first.insert_image(fitz.Rect(30,60,110,160),filename=str(image_path))
    first.insert_htmlbox(fitz.Rect(30,270,400,330),"<p>Embedded font fixture.</p>")
    first.add_text_annot((450,40),"Fixture note")
    first.insert_link({"kind":fitz.LINK_URI,"from":fitz.Rect(30,220,170,245),"uri":"https://example.com"})
    widget = fitz.Widget()
    widget.field_name,widget.field_type = "customer",fitz.PDF_WIDGET_TYPE_TEXT
    widget.rect,widget.field_value = fitz.Rect(200,100,400,125),"Actual form value"
    first.add_widget(widget)
    table = doc.new_page()
    table.insert_text((30,30),"SECOND PAGE")
    for x in [30,200,370]:
        table.draw_line((x,60),(x,150))
    for y in [60,90,120,150]:
        table.draw_line((30,y),(370,y))
    for x,y,value in [(40,80,"Item"),(210,80,"Amount"),(40,110,"Apples"),(210,110,"42"),(40,140,"Pears"),(210,140,"10")]:
        table.insert_text((x,y),value)
    doc.new_page()
    last = doc.new_page()
    last.insert_text((30,40),"LAST PAGE")
    # Add an exact visual duplicate of the last page.
    copied = fitz.open(stream=doc.tobytes(),filetype="pdf")
    doc.insert_pdf(copied,from_page=3,to_page=3)
    copied.close()
    doc.embfile_add("note.txt",b"Actual embedded attachment")
    doc.set_metadata({"title":"Fixture title","author":"Fixture author"})
    doc.set_toc([[1,"Existing bookmark",1]])
    source = work / "source.pdf"
    doc.save(source)
    doc.close()
    other = fitz.open()
    other.new_page().insert_text((40,60),"OTHER PAGE")
    other_path = work / "other.pdf"
    other.save(other_path)
    other.close()
    defaults = {
        "duplicate-pages":{"pages":"1"},
        "extract-pages":{"pages":"2,4"},
        "add-pdf-bookmarks":{"bookmarks":"1|Introduction\n4|End"},
        "add-pdf-link":{"url":"https://example.org","x":"50","y":"400","width":"100","height":"20"},
        "set-pdf-metadata":{"title":"Changed title","author":"Changed author"},
        "add-pdf-background":{"color":"#ff0000"},
    }
    failed = []
    for slug in slugs:
        paths = [source,other_path] if slug=="interleave-pdf" else [source]
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = process({"slug":slug,"paths":[str(p) for p in paths],"options":defaults.get(slug,{})})
            file = result["files"][0]
            data = base64.b64decode(file["dataBase64"])
            assert len(data)==file["bytes"]==result["outputBytes"] and data
            suffix = Path(file["name"]).suffix
            if suffix==".pdf":
                with fitz.open(stream=data,filetype="pdf") as out:
                    assert out.page_count==result["pageCount"]
                    count = {"reverse-pdf":5,"extract-pages":2,"duplicate-pages":6,"odd-pages":3,
                             "even-pages":2,"remove-blank-pages":4,"remove-duplicate-pages":4,
                             "add-blank-pages":6,"n-up-pdf":2,"booklet-pdf":4,"interleave-pdf":6}.get(slug)
                    if count is not None: assert len(out)==count,(slug,len(out),count)
                    if slug=="reverse-pdf": assert "LAST PAGE" in out[0].get_text()
                    if slug=="extract-pages": assert "SECOND PAGE" in out[0].get_text()
                    if slug=="add-pdf-bookmarks": assert out.get_toc()[0]==[1,"Introduction",1]
                    if slug=="add-pdf-link": assert any(x.get("uri")=="https://example.org" for x in out[0].get_links())
                    if slug=="flatten-pdf": assert not list(out[0].widgets() or []) and not list(out[0].annots() or [])
                    if slug=="remove-annotations": assert not list(out[0].annots() or [])
                    if slug=="remove-pdf-links": assert not out[0].get_links()
                    if slug=="set-pdf-metadata": assert out.metadata["title"]=="Changed title"
                    if slug=="remove-pdf-metadata": assert not out.metadata["author"] and not out.metadata["title"]
                    if slug=="strip-pdf-attachments": assert not out.embfile_names()
                    if slug in {"grayscale-pdf","invert-pdf","rasterize-pdf"}: assert not out[0].get_text().strip()
            elif suffix==".png":
                with Image.open(io.BytesIO(data)) as out:
                    assert out.format=="PNG"
            elif suffix==".zip":
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    assert archive.namelist()
                    if slug=="pdf-to-png":
                        for name in archive.namelist():
                            with Image.open(io.BytesIO(archive.read(name))) as check: assert check.format=="PNG"
                    if slug=="extract-attachments": assert b"Actual embedded attachment" in [archive.read(n) for n in archive.namelist()]
                    if slug=="pdf-to-csv": assert any(b"Apples" in archive.read(n) for n in archive.namelist())
            elif suffix==".json":
                parsed = json.loads(data)
                if slug=="pdf-to-json": assert parsed["sourcePageCount"]==5 and "FIRST PAGE" in parsed["pages"][0]["text"]
                if slug=="extract-bookmarks": assert parsed["bookmarks"][0][1]=="Existing bookmark"
            elif suffix==".html":
                assert b"<!DOCTYPE html>" in data and b"<script>" not in data
            elif slug=="pdf-to-text":
                assert b"FIRST PAGE" in data
            print("PASS",slug,suffix,len(data),flush=True)
        except Exception as error:
            import traceback
            traceback.print_exc()
            failed.append((slug,str(error)))
            print("FAIL",slug,str(error),flush=True)
    print(json.dumps({"passed":len(slugs)-len(failed),"failed":failed}),flush=True)
    if failed:
        raise SystemExit(1)