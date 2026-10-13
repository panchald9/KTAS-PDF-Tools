import pymupdf as fitz
from common import number, open_pdf, page_list, saved
from extra_common import csv_data, finish, json_bytes
from pdf_advanced_common import array_option, spec_number

TOOLS = {"pdf-form-builder","export-pdf-form-data","remove-pdf-form-fields","clear-pdf-form-values"}


def process(slug,paths,options):
    with open_pdf(paths[0],options.get("password","")) as doc:
        warnings,text = [],""
        if slug=="pdf-form-builder":
            specs = array_option(options,"fieldSpecs",100)
            names = {w.field_name for p in doc for w in p.widgets() or []}
            for spec in specs:
                name = spec.get("name","")
                if not isinstance(name,str) or not name.strip() or len(name)>100 or name in names:
                    raise ValueError("Each field needs a unique, non-empty name of at most 100 characters.")
                names.add(name)
                index = spec_number(spec,"page",1,1,len(doc),integer=True)-1
                page = doc[index]
                page.remove_rotation()
                x,y = spec_number(spec,"x",50,0,page.rect.width),spec_number(spec,"y",150,0,page.rect.height)
                width = spec_number(spec,"width",220,5,page.rect.width)
                height = spec_number(spec,"height",28,5,page.rect.height)
                rect = fitz.Rect(x,y,x+width,y+height)
                if not page.rect.contains(rect):
                    raise ValueError(f"Field {name} extends outside page {index+1}.")
                kind = spec.get("type","text")
                if kind not in {"text","checkbox","dropdown"}:
                    raise ValueError("Fields must be text, checkbox or dropdown.")
                value = spec.get("value","")
                if not isinstance(value,(str,bool)) or len(str(value))>2000:
                    raise ValueError("Field values must be short text or a checkbox state.")
                widget = fitz.Widget()
                widget.field_name = name
                widget.rect = rect
                widget.field_type = {"text":fitz.PDF_WIDGET_TYPE_TEXT,"checkbox":fitz.PDF_WIDGET_TYPE_CHECKBOX,
                                     "dropdown":fitz.PDF_WIDGET_TYPE_COMBOBOX}[kind]
                widget.text_font,widget.text_fontsize = "Helv",11
                widget.border_width,widget.border_color = 1,(0.4,0.4,0.4)
                widget.fill_color,widget.text_color = (1,1,1),(0,0,0)
                required = spec.get("required",False)
                if not isinstance(required,bool):
                    raise ValueError("The required field flag must be true or false.")
                widget.field_flags = fitz.PDF_FIELD_IS_REQUIRED if required else 0
                if kind=="checkbox":
                    widget.field_value = "Yes" if value is True or str(value).lower() in {"yes","true","1","on"} else "Off"
                elif kind=="dropdown":
                    choices = spec.get("choices",[])
                    if not isinstance(choices,list) or not 1<=len(choices)<=50 or not all(isinstance(v,str) and 0<len(v)<=200 for v in choices):
                        raise ValueError("Dropdowns need 1–50 non-empty text choices.")
                    if len(set(choices))!=len(choices):
                        raise ValueError("Dropdown choices must be unique.")
                    if value != "" and value not in choices:
                        raise ValueError("Choose an initial dropdown value from its choices.")
                    widget.choice_values = choices
                    widget.field_value = value
                else:
                    widget.field_value = str(value)
                page.add_widget(widget)
            data,extension = saved(doc),".pdf"
            warnings.append("Native AcroForm fields added. Review non-Latin values and fill/save the PDF in a compatible viewer.")
        elif slug=="export-pdf-form-data":
            records = [{"page":i+1,"name":w.field_name,"type":w.field_type_string,"value":w.field_value,
                        "rect":list(w.rect),"required":bool(w.field_flags & fitz.PDF_FIELD_IS_REQUIRED)}
                       for i,p in enumerate(doc) for w in p.widgets() or []]
            if not records:
                raise ValueError("No native form fields were found.")
            format = options.get("format","json")
            if format=="json":
                data,extension = json_bytes({"fields":records}),".json"
                text = data.decode()
            elif format=="csv":
                data,extension = csv_data([["page","name","type","value","required"]]+
                                          [[r["page"],r["name"],r["type"],r["value"],r["required"]] for r in records]),".csv"
            else:
                raise ValueError("Choose json or csv.")
        else:
            changed,unsupported = 0,0
            for i in page_list(options.get("pages",""),len(doc)):
                page = doc[i]
                for widget in list(page.widgets() or []):
                    if slug=="remove-pdf-form-fields":
                        page.delete_widget(widget)
                    elif slug=="clear-pdf-form-values":
                        if widget.field_type in {fitz.PDF_WIDGET_TYPE_CHECKBOX,fitz.PDF_WIDGET_TYPE_RADIOBUTTON}:
                            widget.field_value = "Off"
                        elif widget.field_type in {fitz.PDF_WIDGET_TYPE_TEXT,fitz.PDF_WIDGET_TYPE_COMBOBOX,fitz.PDF_WIDGET_TYPE_LISTBOX}:
                            widget.field_value = ""
                        else:
                            unsupported += 1
                            continue
                        # Empty widget text alone regenerates its appearance but
                        # PyMuPDF can leave the previous stored /V behind.
                        # Clear both the widget and inherited field dictionaries.
                        xref,seen = widget.xref,set()
                        while xref and xref not in seen:
                            seen.add(xref)
                            blank = "/Off" if widget.field_type in {fitz.PDF_WIDGET_TYPE_CHECKBOX,fitz.PDF_WIDGET_TYPE_RADIOBUTTON} else "()"
                            doc.xref_set_key(xref,"V",blank)
                            doc.xref_set_key(xref,"DV","null")
                            doc.xref_set_key(xref,"I","null")
                            parent_kind,parent_value = doc.xref_get_key(xref,"Parent")
                            xref = int(parent_value.split()[0]) if parent_kind=="xref" else 0
                        widget.update()
                    else:
                        raise ValueError("Unknown form tool.")
                    changed += 1
            if unsupported:
                warnings.append(f"{unsupported} unsupported field widgets were left unchanged.")
            if slug=="clear-pdf-form-values":
                warnings.append("Clearing widgets is not secure redaction of sensitive page content.")
            data,extension = saved(doc),".pdf"
            text = f"Processed {changed} form fields."
        return finish(slug,paths,data,extension,len(doc),text,warnings)