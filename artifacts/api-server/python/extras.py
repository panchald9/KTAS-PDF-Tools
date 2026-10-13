import pdf_tools
import pdf_layout_tools
import pdf_scan_tools
import pdf_form_tools
import pdf_export_tools
import advanced_pdf_tools


def dispatch(slug,paths,options):
    for module in (pdf_tools,pdf_layout_tools,pdf_scan_tools,pdf_form_tools,pdf_export_tools,advanced_pdf_tools):
        if slug in module.TOOLS:
            return module.process(slug,paths,options)
    return None