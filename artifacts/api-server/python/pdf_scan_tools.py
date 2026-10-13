import io
import pymupdf as fitz
from PIL import Image, ImageFilter, ImageOps
from common import number, open_pdf, page_list, saved
from extra_common import finish
from pdf_tools import render

TOOLS = {"auto-crop-pdf","deskew-pdf","clean-scanned-pdf"}


def deskew_angle(image):
    sample = image.convert("L")
    sample.thumbnail((900,900))
    ink = sample.point(lambda p:255 if p<150 else 0)
    def score(angle):
        rotated = ink.rotate(angle,Image.Resampling.NEAREST,expand=False,fillcolor=0)
        rows = list(rotated.resize((1,rotated.height),Image.Resampling.BOX).getdata())
        return sum((rows[i]-rows[i-1])**2 for i in range(1,len(rows)))
    baseline = score(0)
    candidates = [(score(i/4),i/4) for i in range(-20,21)]
    best,angle = max(candidates)
    return angle if baseline>0 and best>baseline*1.05 and abs(angle)>=0.25 else 0


def process(slug,paths,options):
    with open_pdf(paths[0],options.get("password","")) as doc:
        warnings,text = [],""
        if slug=="auto-crop-pdf":
            chosen = page_list(options.get("pages",""),len(doc))
            if len(chosen)>200:
                raise ValueError("Automatic cropping is limited to 200 selected pages.")
            padding = number(options,"padding",12,0,100)
            changed = 0
            for i in chosen:
                page = doc[i]
                rotation,old = page.rotation,page.cropbox
                page.set_rotation(0)
                pixmap = render(page,72)
                gray = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples).convert("L")
                bbox = gray.point(lambda p:255 if p<245 else 0).getbbox()
                if bbox:
                    sx,sy = old.width/pixmap.width,old.height/pixmap.height
                    new = fitz.Rect(max(old.x0,old.x0+bbox[0]*sx-padding),max(old.y0,old.y0+bbox[1]*sy-padding),
                                    min(old.x1,old.x0+bbox[2]*sx+padding),min(old.y1,old.y0+bbox[3]*sy+padding))
                    page.set_cropbox(new)
                    changed += 1
                page.set_rotation(rotation)
            data = saved(doc)
            warnings.append("Cropping only hides margins; it is not secure redaction. Review faint marks near the edges.")
            message = f"Detected and cropped content bounds on {changed} pages."
        else:
            if len(doc)>20:
                raise ValueError("Scan cleanup and deskew are limited to 20 pages.")
            mode = options.get("mode","grayscale")
            if mode not in {"grayscale","black-white"}:
                raise ValueError("Choose grayscale or black-white.")
            threshold = number(options,"threshold",170,1,254,integer=True)
            angles = []
            with fitz.open() as out:
                for i,page in enumerate(doc):
                    pixmap = render(page,144)
                    image = Image.frombytes("RGB",(pixmap.width,pixmap.height),pixmap.samples)
                    if slug=="deskew-pdf":
                        angle = deskew_angle(image)
                        angles.append({"page":i+1,"correctionDegrees":angle})
                        image = image.rotate(angle,Image.Resampling.BICUBIC,expand=False,fillcolor="white")
                    elif slug=="clean-scanned-pdf":
                        image = ImageOps.autocontrast(image.convert("L").filter(ImageFilter.MedianFilter(3)),cutoff=1)
                        if mode=="black-white":
                            image = image.point(lambda p:255 if p>=threshold else 0).convert("1")
                    else:
                        raise ValueError("Unknown scan tool.")
                    buffer = io.BytesIO()
                    image.save(buffer,"PNG")
                    target = out.new_page(width=page.rect.width,height=page.rect.height)
                    target.insert_image(target.rect,stream=buffer.getvalue())
                data = saved(out)
            if angles:
                import json
                text = json.dumps(angles,indent=2)
            message = "Created a locally processed image-only PDF."
            warnings.append("Original searchable text, forms and links are not retained. Run OCR afterwards if needed.")
            warnings.append("Review faint details and page edges. Deskew is estimated within ±5 degrees; complex layouts may remain unchanged.")
        return finish(slug,paths,data,".pdf",len(doc),text,warnings,message)