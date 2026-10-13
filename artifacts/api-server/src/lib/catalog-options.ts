import type { ToolOption } from "@workspace/api-zod";
export type Definition = [string, string, string, string, string, string, boolean, ToolOption[], string];
export const option = (key: string, label: string, type: ToolOption["type"], defaultValue = "", description = "", choices: string[] = []): ToolOption => ({
  key, label, type, defaultValue, description,
  choices: choices.map(value => ({value, label: ({es:"Spanish",fr:"French",hi:"Hindi"} as Record<string,string>)[value] ?? value})),
});
export const pages = () => option("pages", "Pages", "text", "", "1-based pages and ranges, e.g. 1,3-5. Blank means all pages.");
export const page = () => option("page", "Page number", "number", "1");
export const pointX = () => option("x", "Horizontal position (points)", "number", "50", "From the left edge. 72 points = one inch.");
export const pointY = () => option("y", "Vertical position (points)", "number", "100", "From the top edge.");
export const password = () => option("password", "PDF password", "password", "", "Required for password-protected sources.");
export const location = () => option("position", "Position", "select", "bottom-center", "", ["bottom-center","bottom-left","bottom-right","top-center"]);
export const imageAccept = ".jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp";