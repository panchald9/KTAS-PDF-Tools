import type { PdfTool, ToolOption } from "@workspace/api-zod";

const option = (key: string, label: string, type: ToolOption["type"], defaultValue: string, choices: string[] = [], description = ""): ToolOption =>
  ({ key, label, type, defaultValue, choices: choices.map((value) => ({
    value, label: ({ png: "PNG", jpg: "JPG", webp: "WebP", contain: "Fit inside (keep proportions)", cover: "Fill and crop", stretch: "Stretch (may distort)" } as Record<string, string>)[value] ?? value.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase()),
  })), description });
const number = (key: string, label: string, value: string, description = "") => option(key, label, "number", value, [], description);
const select = (key: string, label: string, value: string, choices: string[]) => option(key, label, "select", value, choices);
const text = (key: string, label: string, value = "") => option(key, label, "text", value);
const quality = number("quality", "Quality (1–100)", "85");
const format = select("format", "Output format", "png", ["png", "jpg", "webp"]);
type Definition = [string, string, string, string, string, ToolOption[], string?];

const images: Definition[] = [
  ["resize-image", "Resize Image", "Set image dimensions while preserving proportions, filling a crop, or stretching.", "Size & crop", "Scaling",
    [number("width", "Width (pixels, 0 = automatic)", "1280", "Automatic dimensions are supported by Fit inside. Fill and crop or stretch needs positive width and height."), number("height", "Height (pixels, 0 = automatic)", "0"), select("fit", "Resize mode", "contain", ["contain", "cover", "stretch"]), format, quality]],
  ["crop-image", "Crop Image", "Keep an exact rectangular area using pixel coordinates.", "Size & crop", "Crop",
    [number("x", "Left edge (pixels)", "0"), number("y", "Top edge (pixels)", "0"), number("width", "Crop width (0 = remaining width)", "0"), number("height", "Crop height (0 = remaining height)", "0"), format, quality]],
  ["compress-image", "Compress Image", "Re-encode an image as JPEG or WebP with your chosen quality.", "Convert & optimize", "Minimize2",
    [select("format", "Output format", "jpg", ["jpg", "webp"]), quality], "Compression can lose detail and may not make every file smaller. Compare the actual output size. JPEG uses a white background for transparency."],
  ["convert-image", "Convert Image", "Convert a still image to a real PNG, JPEG, or WebP file.", "Convert & optimize", "RefreshCw", [format, quality]],
  ["rotate-image", "Rotate Image", "Rotate your image clockwise by a quarter, half, or three-quarter turn.", "Transform", "RotateCw", [select("degrees", "Clockwise rotation", "90", ["90", "180", "270"]), format, quality]],
  ["flip-image", "Flip Image", "Mirror your image horizontally, vertically, or both ways.", "Transform", "FlipHorizontal", [select("direction", "Mirror direction", "horizontal", ["horizontal", "vertical", "both"]), format, quality]],
  ["grayscale-image", "Grayscale Image", "Convert colors to grayscale while retaining transparency.", "Effects", "Palette", [format, quality]],
  ["blur-image", "Blur Image", "Apply a visible soft blur with an adjustable radius.", "Effects", "Droplets", [number("radius", "Blur radius (0–25 pixels)", "5"), format, quality], "Blur is a visual effect, not secure redaction. Requires browser canvas filter support."],
  ["watermark-image", "Watermark Image", "Place a text watermark on your image with adjustable size and opacity.", "Effects", "Stamp",
    [text("text", "Watermark text", "KTAS Tools"), number("fontSize", "Font size (8–400 pixels)", "32"), number("opacity", "Opacity (0.05–1)", "0.5"), select("position", "Position", "center", ["center", "top-left", "top-right", "bottom-left", "bottom-right"]), format, quality], "A visible watermark is not a guarantee against copying. Text longer than the image is scaled to fit."],
  ["adjust-image", "Adjust Image", "Change brightness, contrast, and saturation without uploading your image.", "Effects", "SlidersHorizontal",
    [number("brightness", "Brightness (0–300%)", "100"), number("contrast", "Contrast (0–300%)", "100"), number("saturation", "Saturation (0–300%)", "100"), format, quality], "Requires browser canvas filter support. Review the preview before downloading."],
  ["invert-image", "Invert Colors", "Create a color negative while preserving the original transparency.", "Effects", "Contrast", [format, quality]],
  ["strip-image-metadata", "Remove Image Metadata", "Rebuild the image from its pixels without carrying over source EXIF metadata.", "Convert & optimize", "ShieldCheck", [format, quality], "Re-encodes pixels, removing source EXIF including GPS tags. Output may include encoder-generated color information. This does not hide identifying content visible in the picture."],
];

const texts: Definition[] = [
  ["word-counter", "Word & Character Counter", "Count words, characters, lines, paragraphs, and estimated reading time.", "Analyze", "ChartNoAxesColumn", []],
  ["case-converter", "Case Converter", "Switch text to uppercase, lowercase, title case, or sentence case.", "Clean & format", "CaseSensitive", [select("mode", "Letter case", "upper", ["upper", "lower", "title", "sentence"])]],
  ["remove-duplicate-lines", "Remove Duplicate Lines", "Keep the first occurrence of each line, in its original order.", "Lines & lists", "ListFilter", [select("matching", "Line matching", "exact", ["exact", "ignore-case"])]],
  ["sort-lines", "Sort Lines", "Sort text lines alphabetically or by their numeric values.", "Lines & lists", "ArrowDownAZ", [select("order", "Sort order", "ascending", ["ascending", "descending", "numeric-ascending", "numeric-descending"])]],
  ["find-and-replace", "Find & Replace", "Replace every literal occurrence of a word or phrase.", "Clean & format", "Replace",
    [text("find", "Find"), text("replace", "Replace with"), select("matching", "Match case", "exact", ["exact", "ignore-case"])], "Literal text matching only, not regular expressions. An empty replacement deletes matches."],
  ["remove-extra-spaces", "Remove Extra Spaces", "Collapse repeated spaces and tabs while preserving line breaks.", "Clean & format", "Space", []],
  ["reverse-text", "Reverse Text", "Reverse characters, word order, or line order.", "Clean & format", "ArrowLeftRight", [select("mode", "Reverse", "characters", ["characters", "words", "lines"])], "Character reversal preserves Unicode code points; complex combined emoji and accents may change appearance."],
  ["slug-generator", "URL Slug Generator", "Turn a heading into a lowercase, hyphen-separated URL slug.", "Clean & format", "Link", []],
  ["text-to-base64", "Text to Base64", "Encode UTF-8 text as a genuine Base64 string.", "Encode & decode", "Binary", []],
  ["base64-to-text", "Base64 to Text", "Decode valid Base64 into UTF-8 text, with clear errors for invalid input.", "Encode & decode", "Binary", []],
  ["url-encode", "URL Encoder", "Percent-encode a string for use as a URL component.", "Encode & decode", "Link", []],
  ["url-decode", "URL Decoder", "Decode percent-encoded URL components into readable text.", "Encode & decode", "Link", [], "Uses decodeURIComponent; plus signs remain plus signs, as this is not a form-urlencoded decoder."],
  ["json-formatter", "JSON Formatter", "Validate and format JSON with readable indentation or compact it.", "Developer", "Braces", [select("indent", "Indentation", "2", ["2", "4", "compact"])], "Invalid JSON and unsafe numeric values are rejected. Keep very large integers as quoted strings."],
  ["html-escape", "HTML Escape / Unescape", "Escape HTML-sensitive characters, or decode common and numeric entities.", "Developer", "Code",
    [select("mode", "Operation", "escape", ["escape", "unescape"])], "Unescape supports amp, lt, gt, quot, apos, nbsp and numeric entities. Output is plain text, never executed HTML."],
  ["remove-empty-lines", "Remove Empty Lines", "Remove blank and whitespace-only lines from a list or document.", "Lines & lists", "ListMinus", []],
  ["extract-emails", "Extract Email Addresses", "Collect unique email-shaped addresses from pasted text.", "Analyze", "Mail", [], "Pattern extraction only; it does not verify whether an address exists or accepts mail."],
  ["extract-urls", "Extract Website URLs", "Collect unique HTTP and HTTPS URLs from pasted text.", "Analyze", "Globe", [], "Extracts explicit HTTP(S) URLs, not bare domains. It does not open links or check their availability."],
  ["add-line-numbers", "Add Line Numbers", "Prefix every line with a number, starting where you choose.", "Lines & lists", "ListOrdered", [number("start", "First line number", "1")]],
  ["trim-text", "Trim Text", "Trim outer whitespace or trim the edges of every line.", "Clean & format", "Scissors", [select("mode", "Trim", "each-line", ["each-line", "whole-text"])]],
  ["compare-text", "Compare Text", "Compare two texts and get an ordered line-by-line change report.", "Analyze", "GitCompare",
    [option("secondText", "Second text", "textarea", "")], "Exact line comparison, not semantic analysis. Limited to 1,000 lines in each text to keep browser processing responsive."],
];

const popular = new Set(["resize-image", "compress-image", "convert-image", "crop-image", "word-counter", "case-converter", "json-formatter", "remove-duplicate-lines"]);
const map = (definitions: Definition[], section: "image" | "text"): PdfTool[] => definitions.map(([slug, name, description, category, icon, options, limitation]) => ({
  section, slug, name, description, category, icon, options, multiple: false, popular: popular.has(slug),
  accept: section === "image" ? ".jpg,.jpeg,.png,.webp,.bmp" : ".txt",
  engine: section === "image" ? "Browser canvas (local)" : "Browser text processing (local)",
  help: section === "image"
    ? ["Choose a still JPEG, PNG, WebP or BMP image (up to 30 MB and 40 megapixels).", "Set the options and process the image entirely in your browser.", "Review the actual result and download it. Keep your original."]
    : ["Paste your text; it stays in this browser tab.", "Choose any options and run the tool.", "Review, copy or download the plain-text result."],
  limitations: limitation ?? (section === "image" ? "Still images only. JPEG flattens transparency to white. Re-encoding may change file size, color information and metadata." : "Works locally on up to 200,000 characters. No text is sent to a processing service."),
}));
export const utilityTools = [...map(images, "image"), ...map(texts, "text")];