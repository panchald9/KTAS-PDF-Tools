"""Verify the new PDF-only engines, output structures and failure cases."""
import base64
import contextlib
import io
import json
import re
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"artifacts/api-server/python"))
import extras
from worker import process
from pdf_scan_tools import deskew_angle

catalog = (ROOT/"artifacts/api-server/src/lib/advanced-tool-catalog.ts").read_text()
slugs = re.findall(r'^\s*\["([^"]+)"',catalog,re.M)
assert len(slugs)==30 and len(set(slugs))==30
registry = set().union(*(getattr(extras,name).TOOLS for name in
                        ["pdf_layout_tools","pdf_scan_tools","pdf_form_tools","pdf_export_tools","advanced_pdf_tools"]))
assert registry==set(slugs)


def invoke(slug,paths,options):
    with contextlib.redirect_stdout(sys.stderr):
        result = process({"slug":slug,"paths":[str(p) for p in paths],"options":options})
    data = base64.b64decode(result["files"][0]["dataBase64"])
    assert data and result["outputBytes"]==len(data)
    return data,result


with tempfile.TemporaryDirectory(prefix="ktas-advanced-check-") as temporary:
    work = Path(temporary)
    doc = fitz.open()
    for i in range(6):
        page = doc.new_page()
        if i in {0,3}:
            page.insert_text((80,100),"SECTION START",fontsize=15)
        page.insert_text((80,150),f"SOURCE PAGE {i+1}: actual source content.",fontsize=14)
    page = doc[0]
    page.add_text_annot((450,200),"Actual PDF note")
    widget = fitz.Widget()
    widget.field_name,widget.field_type = "original_field",fitz.PDF_WIDGET_TYPE_TEXT
    widget.rect,widget.field_value = fitz.Rect(70,220,230,250),"Original value"
    page.add_widget(widget)
    page.insert_link({"kind":fitz.LINK_GOTO,"from":fitz.Rect(70,300,220,330),"page":1,"to":fitz.Point(0,0)})
    page.insert_link({"kind":fitz.LINK_URI,"from":fitz.Rect(70,340,220,360),"uri":"https://example.org"})
    doc[3].set_rotation(90)
    doc.set_metadata({"title":"Actual fixture title","author":"Fixture author"})
    doc.set_toc([[1,"First chapter",1],[1,"Second chapter",4]])
    source = work/"source.pdf"
    doc.save(source)
    doc.close()
    with fitz.open() as template:
        page = template.new_page()
        page.insert_text((50,60),"LAYER CONTENT",fontsize=20)
        overlay = work/"overlay.pdf"
        template.save(overlay)
    attachment = work/"notes.txt"
    attachment.write_text("Actual supporting attachment")
    scan = Image.new("RGB",(700,900),"white")
    draw = ImageDraw.Draw(scan)
    font = ImageFont.load_default(size=24)
    for i in range(16):
        draw.text((45,60+i*45),f"Actual local document scan line {i+1:02d}",fill="black",font=font)
    tilted = scan.rotate(3,Image.Resampling.BICUBIC,expand=False,fillcolor="white")
    correction = deskew_angle(tilted)
    assert -4<=correction<=-1,(correction,"Deskew should counteract actual positive scan tilt.")
    scan_data = io.BytesIO()
    tilted.save(scan_data,"PNG")
    with fitz.open() as scanned:
        scanned.new_page().insert_image(fitz.Rect(0,0,595,842),stream=scan_data.getvalue())
        scan_path = work/"scanned.pdf"
        scanned.save(scan_path)
    fields = [
        {"name":"created_text","type":"text","page":1,"x":0,"y":400,"width":180,"height":25,"value":"Native text","required":True},
        {"name":"created_check","type":"checkbox","page":1,"x":210,"y":400,"width":25,"height":25,"value":"true"},
        {"name":"created_choice","type":"dropdown","page":4,"x":50,"y":400,"width":180,"height":25,"value":"Blue","choices":["Blue","Green"]},
    ]
    defaults = {
        "split-by-size":{"maxMB":"0.01"},
        "split-by-text":{"search":"SECTION START"},
        "split-by-page-count":{"groupSize":"2"},
        "highlight-pdf-text":{"search":"SOURCE PAGE","pages":"1"},
        "pdf-form-builder":{"fieldSpecs":json.dumps(fields)},
        "add-pdf-attachments":{"attachmentNames":json.dumps(["original-notes.txt"])},
        "pdf-headers-footers":{"header":"ACTUAL HEADER","footer":"ACTUAL FOOTER","pages":"1,4"},
        "poster-pdf":{"pages":"1","columns":"2","rows":"2"},
        "pdf-table-of-contents":{},
        "pdf-page-labels":{"rules":'[{"page":1,"style":"r","prefix":"","start":1},{"page":4,"style":"D","prefix":"P-","start":1}]'},
        "auto-crop-pdf":{"padding":"12","pages":"1,4"},
        "set-pdf-print-boxes":{"box":"trim","inset":"9","pages":"1"},
        "pdf-to-tiff":{"dpi":"72","pages":"1"},
        "pdf-to-bmp":{"dpi":"72","pages":"1"},
    }
    failed = []
    for slug in slugs:
        paths = [source]
        if slug in {"deskew-pdf","clean-scanned-pdf"}:
            paths = [scan_path]
        elif slug=="overlay-pdf":
            paths = [source,overlay]
        elif slug=="add-pdf-attachments":
            paths = [source,attachment]
        try:
            data,result = invoke(slug,paths,defaults.get(slug,{}))
            suffix = Path(result["files"][0]["name"]).suffix
            if suffix==".pdf":
                with fitz.open(stream=data,filetype="pdf") as out:
                    assert len(out)==result["pageCount"]
                    if slug=="auto-crop-pdf":
                        assert out[0].cropbox.width<595 and out[0].cropbox.height<842
                    elif slug in {"deskew-pdf","clean-scanned-pdf"}:
                        assert len(out)==1 and not out[0].get_text().strip()
                        assert out[0].get_images()
                        if slug=="deskew-pdf":
                            angle = json.loads(result["text"])[0]["correctionDegrees"]
                            assert -4<=angle<=-1,angle
                    elif slug=="highlight-pdf-text":
                        assert any(a.type[1]=="Highlight" for a in out[0].annots())
                    elif slug=="pdf-form-builder":
                        widgets = {w.field_name:w for p in out for w in p.widgets() or []}
                        assert set(widgets)=={"original_field","created_text","created_check","created_choice"}
                        assert widgets["created_text"].field_value=="Native text" and widgets["created_text"].rect.x0==0
                        assert widgets["created_text"].field_flags & fitz.PDF_FIELD_IS_REQUIRED
                        assert widgets["created_check"].field_value!="Off"
                        assert widgets["created_choice"].field_value=="Blue" and out[3].rotation==0
                    elif slug=="add-pdf-attachments":
                        assert out.embfile_get("original-notes.txt")==attachment.read_bytes()
                    elif slug=="overlay-pdf":
                        assert all("LAYER CONTENT" in p.get_text() for p in out)
                    elif slug=="pdf-headers-footers":
                        assert "ACTUAL HEADER" in out[0].get_text() and "ACTUAL FOOTER" in out[3].get_text()
                        assert "ACTUAL HEADER" not in out[1].get_text()
                    elif slug=="poster-pdf":
                        assert len(out)==4 and all("Source page 1" in p.get_text() for p in out)
                    elif slug=="pdf-table-of-contents":
                        assert len(out)==7 and len(out[0].get_links())==2
                        targets = [l["page"] for l in out[0].get_links()]
                        assert targets==[1,4] and "SOURCE PAGE 1" in out[1].get_text()
                    elif slug=="bates-numbering":
                        assert "KTAS-000001" in out[0].get_text() and "KTAS-000006" in out[-1].get_text()
                    elif slug=="remove-pdf-bookmarks":
                        assert not out.get_toc() and len(out)==6
                    elif slug=="pdf-page-labels":
                        assert out[0].get_label()=="i" and out[3].get_label()=="P-1"
                    elif slug=="set-pdf-print-boxes":
                        assert out[0].trimbox==fitz.Rect(9,9,586,833)
                    elif slug=="remove-pdf-form-fields":
                        assert not list(out[0].widgets() or []) and "SOURCE PAGE 1" in out[0].get_text()
                    elif slug=="clear-pdf-form-values":
                        assert list(out[0].widgets())[0].field_value==""
            elif suffix in {".zip",".epub",".odt"}:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    assert archive.namelist()
                    if slug.startswith("split-"):
                        total = 0
                        for name in archive.namelist():
                            with fitz.open(stream=archive.read(name),filetype="pdf") as part:
                                total += len(part)
                                if slug=="split-by-size" and len(part)>1:
                                    assert len(archive.read(name))<=int(0.01*1024*1024)
                        assert total==6
                        if slug in {"split-by-bookmarks","split-by-text"}: assert len(archive.namelist())==2
                        if slug=="split-by-page-count": assert len(archive.namelist())==3
                    elif slug in {"pdf-to-tiff","pdf-to-bmp"}:
                        with Image.open(io.BytesIO(archive.read(archive.namelist()[0]))) as image:
                            assert image.format==("TIFF" if slug=="pdf-to-tiff" else "BMP")
                    else:
                        assert archive.infolist()[0].filename=="mimetype" and archive.infolist()[0].compress_type==zipfile.ZIP_STORED
                        for name in archive.namelist():
                            if name.endswith((".xml",".opf",".xhtml")):
                                ET.fromstring(archive.read(name))
                        if slug=="pdf-to-epub":
                            assert archive.read("mimetype")==b"application/epub+zip"
                            assert b"SOURCE PAGE 1" in archive.read("OEBPS/chapter-1.xhtml")
                        else:
                            assert b"SOURCE PAGE 1" in archive.read("content.xml")
            elif suffix==".rtf":
                assert data.startswith(b"{\\rtf1") and b"SOURCE PAGE 1" in data and data.endswith(b"}")
            elif suffix==".json":
                parsed = json.loads(data)
                if slug=="export-pdf-form-data": assert parsed["fields"][0]["value"]=="Original value"
                elif slug=="export-pdf-comments": assert any(r["content"]=="Actual PDF note" for r in parsed["annotations"])
                elif slug=="pdf-page-boxes": assert parsed["records"][0]["mediabox"]==[0,0,595,842]
                elif slug=="extract-pdf-links": assert len(parsed["records"])==2
                elif slug=="check-internal-pdf-links": assert {r["status"] for r in parsed["records"]}=={"valid","not-verified"}
            print("PASS",slug,suffix,len(data),flush=True)
        except Exception as error:
            import traceback
            traceback.print_exc()
            failed.append((slug,str(error)))
            print("FAIL",slug,str(error),flush=True)
    # Changed variants: CSV exports, multi-document sequencing, explicit contents,
    # binary cleanup, bleed geometry and invalid input rejection.
    for slug in ["export-pdf-form-data","export-pdf-comments"]:
        data,_ = invoke(slug,[source],{"format":"csv"})
        assert b"Original value" in data if slug=="export-pdf-form-data" else b"Actual PDF note" in data
    data,_ = invoke("bates-numbering",[source,overlay],{})
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        with fitz.open(stream=archive.read("numbered-02.pdf"),filetype="pdf") as out:
            assert "KTAS-000007" in out[0].get_text()
    data,_ = invoke("pdf-table-of-contents",[source],{"entries":"2|Actual custom entry"})
    with fitz.open(stream=data,filetype="pdf") as out:
        assert out[0].get_links()[0]["page"]==2
    built,_ = invoke("pdf-form-builder",[source],{"fieldSpecs":json.dumps(fields)})
    built_path = work/"built.pdf"
    built_path.write_bytes(built)
    cleared,_ = invoke("clear-pdf-form-values",[built_path],{})
    with fitz.open(stream=cleared,filetype="pdf") as out:
        values = {w.field_name:w.field_value for p in out for w in p.widgets() or []}
        assert values["created_text"]=="" and values["created_choice"]=="" and values["created_check"]=="Off"
    empty_choice = dict(fields[2],value="",page=1)
    data,_ = invoke("pdf-form-builder",[source],{"fieldSpecs":json.dumps([empty_choice])})
    with fitz.open(stream=data,filetype="pdf") as out:
        assert {w.field_name:w.field_value for w in out[0].widgets()}["created_choice"]==""
    data,_ = invoke("clean-scanned-pdf",[scan_path],{"mode":"black-white","threshold":"180"})
    with fitz.open(stream=data,filetype="pdf") as out:
        embedded = out.extract_image(out[0].get_images()[0][0])["image"]
        with Image.open(io.BytesIO(embedded)) as cleaned:
            assert set(cleaned.convert("L").getdata()) <= {0,255}
    for slug,options in [
        ("pdf-form-builder",{"fieldSpecs":'[{"name":"bad","x":10000}]'}),
        ("pdf-form-builder",{"fieldSpecs":'[{"name":"bad","x":"","y":40}]'}),
        ("pdf-page-labels",{"rules":'[{"page":1,"start":0}]'}),
        ("highlight-pdf-text",{"search":"ABSENT FIXTURE STRING"}),
        ("overlay-pdf",{}),
        ("pdf-table-of-contents",{"entries":"999|Outside page"}),
        ("split-by-text",{"search":"ABSENT FIXTURE STRING"}),
    ]:
        try:
            invoke(slug,[source],options)
            raise AssertionError("Invalid input was not rejected: "+slug)
        except ValueError:
            pass
    print("PASS changed variants and invalid-input cases",flush=True)
    print(json.dumps({"passed":len(slugs)-len(failed),"failed":failed}),flush=True)
    if failed:
        raise SystemExit(1)