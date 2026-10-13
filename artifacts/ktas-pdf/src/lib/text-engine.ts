export interface TextResult {
  text: string;
  mime: string;
  fileName: string;
  stats: { characters: number; words: number; lines: number; bytes: number };
}

function stats(text: string) {
  return {
    characters: Array.from(text).length,
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    lines: text ? text.split("\n").length : 0,
    bytes: new TextEncoder().encode(text).length,
  };
}
function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
function compareLines(first: string[], second: string[]) {
  if (first.length > 1000 || second.length > 1000) throw new Error("Compare at most 1,000 lines in each text.");
  const columns = second.length + 1;
  const lengths = new Uint16Array((first.length + 1) * columns);
  for (let i = first.length - 1; i >= 0; i--) {
    for (let j = second.length - 1; j >= 0; j--) {
      lengths[i * columns + j] = first[i] === second[j]
        ? lengths[(i + 1) * columns + j + 1]! + 1
        : Math.max(lengths[(i + 1) * columns + j]!, lengths[i * columns + j + 1]!);
    }
  }
  let i = 0, j = 0, added = 0, removed = 0;
  const report: string[] = [];
  while (i < first.length || j < second.length) {
    if (i < first.length && j < second.length && first[i] === second[j]) {
      report.push(`  ${first[i++]}`); j++;
    } else if (j < second.length && (i === first.length || lengths[i * columns + j + 1]! >= lengths[(i + 1) * columns + j]!)) {
      report.push(`+ ${second[j++]}`); added++;
    } else {
      report.push(`- ${first[i++]}`); removed++;
    }
  }
  return `${added} added lines · ${removed} removed lines\nLegend: + added, - removed, two spaces unchanged\n\n${report.join("\n")}`;
}

export function runTextTool(slug: string, input: string, options: Record<string, string> = {}): TextResult {
  if (input.length > 200_000 || (options.secondText?.length ?? 0) > 200_000) throw new Error("Use at most 200,000 characters per text.");
  if (!input.trim()) throw new Error("Enter some text first.");
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  let result: string;
  let mime = "text/plain;charset=utf-8";
  let extension = "txt";
  switch (slug) {
    case "word-counter": {
      const counts = stats(normalized);
      const paragraphs = normalized.trim().split(/\n\s*\n/).length;
      result = `Words: ${counts.words}\nCharacters (including whitespace): ${counts.characters}\nCharacters (without whitespace): ${Array.from(normalized.replace(/\s/gu, "")).length}\nLines: ${counts.lines}\nParagraphs: ${paragraphs}\nUTF-8 bytes: ${counts.bytes}\nEstimated reading time: ${Math.max(1, Math.ceil(counts.words / 200))} minute(s), at 200 words/minute`;
      break;
    }
    case "case-converter": {
      const mode = options.mode ?? "upper";
      if (mode === "upper") result = normalized.toLocaleUpperCase();
      else if (mode === "lower") result = normalized.toLocaleLowerCase();
      else if (mode === "title") result = normalized.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase());
      else if (mode === "sentence") result = normalized.toLocaleLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase());
      else throw new Error("Choose a supported letter case.");
      break;
    }
    case "remove-duplicate-lines": {
      const seen = new Set<string>();
      result = lines.filter((line) => {
        const key = options.matching === "ignore-case" ? line.toLocaleLowerCase() : line;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).join("\n");
      break;
    }
    case "sort-lines": {
      const order = options.order ?? "ascending";
      if (order.startsWith("numeric") && lines.some((line) => !line.trim() || !Number.isFinite(Number(line)))) throw new Error("Numeric sorting requires one valid finite number on every line.");
      result = [...lines].sort((a, b) => {
        const compared = order.startsWith("numeric") ? Number(a) - Number(b) : a.localeCompare(b, "en", { sensitivity: "variant" });
        return order.endsWith("descending") ? -compared : compared;
      }).join("\n");
      break;
    }
    case "find-and-replace": {
      if (!options.find) throw new Error("Enter the literal text to find.");
      const escaped = options.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = normalized.replace(new RegExp(escaped, options.matching === "ignore-case" ? "gi" : "g"), () => options.replace ?? "");
      break;
    }
    case "remove-extra-spaces": result = normalized.replace(/[ \t]+/g, " "); break;
    case "reverse-text": {
      const mode = options.mode ?? "characters";
      result = mode === "lines" ? [...lines].reverse().join("\n")
        : mode === "words" ? normalized.trim().split(/\s+/u).reverse().join(" ")
        : Array.from(normalized).reverse().join("");
      break;
    }
    case "slug-generator": result = normalized.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, ""); break;
    case "text-to-base64": result = encodeBase64(input); break;
    case "base64-to-text": {
      const encoded = input.replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw new Error("Enter valid standard Base64 text.");
      try {
        const decoded = atob(encoded);
        result = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(decoded, (char) => char.charCodeAt(0)));
      } catch { throw new Error("This is not valid Base64-encoded UTF-8 text."); }
      break;
    }
    case "url-encode": {
      try { result = encodeURIComponent(input); } catch { throw new Error("Text contains an invalid Unicode sequence."); }
      break;
    }
    case "url-decode": {
      try { result = decodeURIComponent(input); } catch { throw new Error("The percent-encoded text is invalid. Check escape sequences such as %20."); }
      break;
    }
    case "json-formatter": {
      input.replace(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (match, numeric: string | undefined) => {
        if (numeric) {
          const value = Number(numeric);
          if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error("JSON contains a number outside the safe range. Quote large integers as strings to preserve them.");
        }
        return match;
      });
      let parsed: unknown;
      try { parsed = JSON.parse(input); } catch (error) { throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : "check its syntax"}`); }
      const indent = options.indent ?? "2";
      result = JSON.stringify(parsed, null, indent === "compact" ? undefined : indent === "4" ? 4 : 2);
      mime = "application/json;charset=utf-8"; extension = "json"; break;
    }
    case "html-escape": {
      const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
      if (options.mode === "unescape") {
        result = normalized.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match: string, entity: string) => {
          if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
          const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
          return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
        });
      } else {
        const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        result = normalized.replace(/[&<>"']/g, (char) => map[char]!);
      }
      break;
    }
    case "remove-empty-lines": result = lines.filter((line) => line.trim()).join("\n"); break;
    case "extract-emails": result = [...new Set((normalized.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi) ?? []).map((address) => address.toLowerCase()))].join("\n"); break;
    case "extract-urls": {
      const found = normalized.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
      result = [...new Set(found.map((url) => url.replace(/[.,;!?)}\]]+$/g, "")).filter((url) => { try { return !!new URL(url).hostname; } catch { return false; } }))].join("\n");
      break;
    }
    case "add-line-numbers": {
      const start = Number(options.start ?? "1");
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(start + lines.length)) throw new Error("Choose a non-negative, safe integer for the first line number.");
      result = lines.map((line, index) => `${start + index}. ${line}`).join("\n"); break;
    }
    case "trim-text": result = options.mode === "whole-text" ? normalized.trim() : lines.map((line) => line.trim()).join("\n"); break;
    case "compare-text": {
      if (!options.secondText?.trim()) throw new Error("Enter the second text to compare.");
      result = compareLines(lines, options.secondText.replace(/\r\n?/g, "\n").split("\n")); break;
    }
    default: throw new Error("This text tool is not implemented.");
  }
  return { text: result, mime, fileName: `ktas-${slug}.${extension}`, stats: stats(input) };
}