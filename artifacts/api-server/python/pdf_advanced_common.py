import html
import json
import pymupdf as fitz
from common import number, saved, zip_outputs


def array_option(options,key,limit=100):
    try:
        value = json.loads(options.get(key,""))
    except (ValueError,TypeError):
        raise ValueError(f"{key} must contain a valid JSON array.")
    if not isinstance(value,list) or not 1<=len(value)<=limit or not all(isinstance(v,dict) for v in value):
        raise ValueError(f"{key} requires 1–{limit} objects.")
    return value


def spec_number(spec,key,default,minimum,maximum,integer=False):
    value = spec.get(key,default)
    if isinstance(value,bool) or value is None or isinstance(value,(dict,list)) or not str(value).strip():
        raise ValueError(f"{key} must be a valid number.")
    return number({key:str(value)},key,default,minimum,maximum,integer)


def add_line(page,text,footer=False,align="center"):
    if align not in {"left","center","right"}:
        raise ValueError("Choose left, center or right alignment.")
    if len(text)>300:
        raise ValueError("Header, footer and stamp text must be at most 300 characters.")
    rect = fitz.Rect(18,page.rect.height-40,page.rect.width-18,page.rect.height-12) if footer else fitz.Rect(18,12,page.rect.width-18,40)
    if rect.is_empty or not page.rect.contains(rect):
        raise ValueError("This page is too small for the requested header or footer.")
    spare,_scale = page.insert_htmlbox(rect,f'<p style="margin:0;text-align:{align}">{html.escape(text)}</p>',
                                      css="body {font-family:sans-serif;font-size:10pt;}",scale_low=0.5)
    if spare<0:
        raise ValueError("The header/footer text does not fit. Use shorter text.")


def split_ranges(doc,starts):
    starts = sorted(set([0]+starts))
    if len(starts)>200:
        raise ValueError("Splitting is limited to 200 output parts.")
    parts = []
    for n,start in enumerate(starts):
        end = starts[n+1] if n+1<len(starts) else len(doc)
        if end<=start:
            continue
        with fitz.open() as part:
            part.insert_pdf(doc,from_page=start,to_page=end-1,widgets=True)
            parts.append((f"part-{n+1:03d}-pages-{start+1}-{end}.pdf",saved(part)))
    return zip_outputs(parts)