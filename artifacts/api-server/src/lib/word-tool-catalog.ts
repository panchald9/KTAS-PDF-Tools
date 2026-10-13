import type { PdfTool } from "@workspace/api-zod";
import { option, type Definition } from "./catalog-options";

const text = (key: string, label: string, value = "") => option(key, label, "text", value);
const number = (key: string, label: string, value: string) => option(key, label, "number", value);
const definitions: Definition[] = [
  ["text-to-word", "Text to Word", "Create an editable DOCX from an uploaded UTF-8 text file.", "Word conversion", "FilePlus", ".txt", false, [text("title", "Document title")], "Plain text becomes paragraphs. This is not a rich-text editor."],
  ["merge-word", "Merge Word Documents", "Combine DOCX documents in your chosen order.", "Word organization", "Files", ".docx", true, [], "Styles and embedded images are composed locally. Headers and footers come from the first document. Complex fields, numbering and sections should be checked."],
  ["word-to-text", "Word to Text", "Extract paragraphs and table text into a UTF-8 text file.", "Word extraction", "FileText", ".docx", false, [], "Extracts body text and tables, not text in images or floating shapes."],
  ["word-to-html", "Word to HTML", "Export body paragraphs and tables as a safe standalone HTML file.", "Word conversion", "Code2", ".docx", false, [], "A simplified text-and-table export. Exact layout, images, links and advanced formatting are not retained."],
  ["word-tables-to-csv", "Word Tables to CSV", "Export each top-level Word table as a CSV in a ZIP.", "Word extraction", "Table2", ".docx", false, [], "Top-level tables only. Merged cells can repeat values. Formula-like cells are escaped for spreadsheet safety."],
  ["extract-word-images", "Extract Word Images", "Download embedded images from your DOCX in a ZIP.", "Word extraction", "Images", ".docx", false, [], "Returns stored media images, not rendered pages, charts or externally linked images."],
  ["word-statistics", "Word Document Statistics", "Count body words, characters, paragraphs, tables and embedded images.", "Word analysis", "ChartBar", ".docx", false, [], "Words are whitespace-delimited. Counts include top-level table cell text; page counts require rendering and are not estimated."],
  ["word-metadata", "Read Word Metadata", "Inspect the document's core properties as JSON.", "Word analysis", "Info", ".docx", false, [], "Shows core properties only. Properties may be missing or inaccurate and do not prove authorship."],
  ["remove-word-metadata", "Remove Word Metadata", "Clear the DOCX core document properties.", "Word privacy", "ShieldCheck", ".docx", false, [], "Clears core properties only, not comments, revision authors, custom properties, embedded files or sensitive document text. Not a complete sanitization tool."],
  ["remove-word-comments", "Remove Word Comments", "Remove comments and their body markers from a DOCX.", "Word privacy", "MessageSquare", ".docx", false, [], "Removes classic comments and modern comment-related package parts. Does not remove tracked changes or metadata."],
  ["accept-word-revisions", "Accept Word Tracked Changes", "Keep insertions, remove deletions and accept recorded formatting changes.", "Word editing", "Check", ".docx", false, [], "Irreversible in the output: keep the original. Supports standard WordprocessingML insertions, deletions, move markers and property changes; unusual revision constructs need review."],
  ["find-replace-word", "Find and Replace in Word", "Replace literal matching text across body paragraphs, tables, headers and footers.", "Word editing", "Replace", ".docx", false, [text("find", "Text to find"), text("replace", "Replacement text")], "Case-sensitive literal matching, including matches split across text runs. Text boxes and field instructions are excluded. Replacement uses formatting at the start of the match."],
  ["word-page-size", "Change Word Page Size", "Set all document sections to A4, Letter or Legal paper.", "Word formatting", "File", ".docx", false, [option("size", "Paper size", "select", "A4", "", ["A4", "Letter", "Legal"]), option("orientation", "Orientation", "select", "portrait", "", ["portrait", "landscape"])], "Changes section settings; content may reflow. Review pagination in Word."],
  ["word-margins", "Change Word Margins", "Set top, bottom, left and right margins for every section.", "Word formatting", "Crop", ".docx", false, [number("top", "Top margin (mm)", "25"), number("bottom", "Bottom margin (mm)", "25"), number("left", "Left margin (mm)", "25"), number("right", "Right margin (mm)", "25")], "Margins must be 0–100 mm and leave usable page space. Headers, footers and positioned objects may need adjustment."],
  ["word-font", "Change Word Font", "Apply a font family and size to text runs in the document.", "Word formatting", "Type", ".docx", false, [text("font", "Font family", "Arial"), number("fontSize", "Font size (points)", "12")], "Applies to paragraphs, tables, headers and footers. Does not embed fonts or edit text boxes. Your device needs the selected font."],
  ["word-line-spacing", "Change Word Line Spacing", "Apply a line-spacing multiplier to body paragraphs and table cells.", "Word formatting", "AlignJustify", ".docx", false, [number("spacing", "Line-spacing multiplier (0.5–3)", "1.5")], "Changes body paragraph spacing; content may reflow. Headers and footers are unchanged."],
  ["word-header-footer", "Set Word Header and Footer", "Replace default header and footer text across all sections.", "Word formatting", "PanelTop", ".docx", false, [text("header", "Header text"), text("footer", "Footer text")], "Replaces default header/footer contents, including existing logos and fields. First-page and even-page variants remain unchanged. Keep your original."],
  ["remove-word-empty-paragraphs", "Remove Empty Word Paragraphs", "Remove empty body paragraphs while retaining image and section-break paragraphs.", "Word organization", "ListMinus", ".docx", false, [], "Removes only empty paragraphs directly in the body. Spacing can change. Table cells, headers, footers and page-break paragraphs are kept."],
];

export const wordTools: PdfTool[] = definitions.map(([slug, name, description, category, icon, accept, multiple, options, limitations]) => ({
  slug, name, description, category, icon, accept, multiple, options, limitations,
  section: "word", engine: "Python DOCX / local document processing",
  popular: ["text-to-word", "merge-word", "word-to-text", "find-replace-word"].includes(slug),
  help: [
    `Choose ${accept} files${multiple ? " in the order to merge" : ""}. Files are processed temporarily on KTAS servers, never by an external document API.`,
    "Review the options and limitations. This tool does not provide a rendered Word preview.",
    "Download and open the result in Word or a compatible editor. Keep the original and check formatting.",
  ],
}));