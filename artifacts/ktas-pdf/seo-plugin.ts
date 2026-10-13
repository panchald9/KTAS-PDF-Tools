import type { Plugin } from "vite";
import { tools as pdfTools } from "../api-server/src/lib/tool-catalog";
import { wordTools } from "../api-server/src/lib/word-tool-catalog";
import { excelTools } from "../api-server/src/lib/excel-tool-catalog";
import { utilityTools } from "../api-server/src/lib/utility-catalog";
import { GUIDES } from "./src/lib/guides";

const domain = "https://ktastools.com";
type Tool = (typeof utilityTools)[number] | (typeof pdfTools)[number] | (typeof wordTools)[number] | (typeof excelTools)[number];
type Page = { path: string; title: string; description: string; body: string; tool?: Tool };
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const link = (path: string, label: string) => `<a href="${escape(path)}">${escape(label)}</a>`;
const installedTools: Tool[] = [
  ...pdfTools.map((tool) => ({ ...tool, section: "pdf" as const })),
  ...wordTools,
  ...excelTools,
  ...utilityTools,
];
const sectionLabel = (section?: string) => section === "excel" ? "Excel" : section === "word" ? "Word" : section === "image" ? "Image" : section === "text" ? "Text" : "PDF";
const sectionDescription = (section: string) =>
  section === "pdf" ? "merge, split, convert, edit and secure PDF documents with temporary server processing"
    : section === "excel" ? "merge, split, clean, inspect and convert XLSX and CSV files with temporary server processing, not browser or external API processing"
    : section === "word" ? "merge, convert, edit, inspect and organize DOCX documents with temporary server processing"
      : section === "image" ? "resize, crop, compress, convert and edit images directly in your browser"
        : "count, format, compare, clean and encode text directly in your browser";

function pagesFor(tools: Tool[]) {
  const pages = new Map<string, Page>();
  const add = (path: string, title: string, description: string, body = "", tool?: Tool) => pages.set(path, { path, title, description, body, tool });
  const directory = (items: Tool[]) => `<ul>${items.map((tool) => `<li>${link(`/${tool.section ?? "pdf"}/${tool.slug}`, tool.name)} — ${escape(tool.description)}</li>`).join("")}</ul>`;
  add("/", "KTAS Tools — Free PDF, Word, Excel, Image & Text Tools", "Free practical PDF, Word, Excel, image and text tools for everyday tasks. No subscriptions. PDF, Word and Excel files are processed temporarily on KTAS servers; image and text tasks stay in your browser.",
    `<h2>Five toolkits, one website</h2><p>${link("/pdf", "PDF tools")} · ${link("/word", "Word tools")} · ${link("/excel", "Excel tools")} · ${link("/image", "Image tools")} · ${link("/text", "Text tools")}</p><h2>Explore every tool</h2>${directory(tools)}`);
  add("/tools", "All Free Tools — PDF, Word, Excel, Image & Text | KTAS Tools", "Browse all KTAS PDF, Word, Excel, image and text tools. Find a practical document or browser-local utility without subscriptions.", directory(tools));
  for (const section of ["pdf", "word", "excel", "image", "text"]) {
    const label = sectionLabel(section);
    add(`/${section}`, `Free ${label} Tools | KTAS Tools`, `Free ${label.toLowerCase()} tools to ${sectionDescription(section)}. No account required.`, directory(tools.filter((tool) => tool.section === section)));
  }
  for (const tool of tools) {
    const path = `/${tool.section ?? "pdf"}/${tool.slug}`;
    add(path, `${tool.name} — Free ${sectionLabel(tool.section)} Tool | KTAS Tools`, tool.description,
      `<p>${escape(tool.engine)}. No subscription or external content-processing API.</p><h2>How to use ${escape(tool.name)}</h2><ol>${tool.help.map((step) => `<li>${escape(step)}</li>`).join("")}</ol><h2>Options</h2>${tool.options.length ? `<ul>${tool.options.map((option) => `<li>${escape(option.label)}${option.description ? `: ${escape(option.description)}` : ""}</li>`).join("")}</ul>` : "<p>No additional options are required.</p>"}<h2>Important limitations</h2><p>${escape(tool.limitations)}</p><p>${link(`/${tool.section ?? "pdf"}`, "Browse related tools")}</p>`, tool);
  }
  add("/guides", "Practical PDF Guides | KTAS Tools", "Practical guides to PDF compression, conversion, signatures and safer document handling.", `<ul>${GUIDES.map((guide) => `<li>${link(`/guides/${guide.slug}`, guide.title)} — ${escape(guide.summary)}</li>`).join("")}</ul>`);
  for (const guide of GUIDES) add(`/guides/${guide.slug}`, `${guide.title} | KTAS Tools`, guide.summary, guide.sections.map((section) => `<h2>${escape(section.h)}</h2>${section.p.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}`).join(""));
  add("/about", "About KTAS Tools", "Learn about KTAS Tools, the free PDF, Word, Excel, image and text toolkit by Kali Tech and Services.", "<p>KTAS Tools offers free tools without subscriptions. PDF, Word and Excel files are processed temporarily by locally installed KTAS server software, not in your browser or by external APIs; image and text tools run in your browser. Supported by advertising.</p>");
  add("/contact", "Contact KTAS Tools", "Contact Kali Tech and Services about KTAS Tools, support, tool suggestions or advertising.", `<p>Use the official ${link("https://kalitechandservices.com/index.php/contact-us/", "Kali Tech and Services contact page")}.</p>`);
  add("/privacy", "Privacy Policy | KTAS Tools", "How KTAS Tools handles temporarily server-processed PDF, Word and Excel files, browser-local text and images, consented visitor analytics and advertisements.", "<p>PDF, Word and Excel files are processed temporarily on KTAS servers; temporary files are removed after processing and no document history is stored. Image and text contents stay in your browser. Optional visitor analytics records IP address, approximate country, device, browser, operating system and visited page for at most 30 days, and is private to the verified owner. No document contents, filenames or URL queries are tracked. Essential only disables optional analytics and advertising.</p>");
  add("/terms", "Terms of Use | KTAS Tools", "Read the terms and limitations for free KTAS PDF, Word, Excel, image and text tools.", "<p>Use only content you own or are authorized to process. Keep originals and review all results. Tool outputs are not guarantees of legal validity, confidentiality or accuracy. Browser and document-format limitations apply.</p>");
  add("/cookie-policy", "Cookie Policy | KTAS Tools", "Control essential storage, optional ads and visitor analytics on KTAS Tools.", "<p>Essential storage remembers your preference. Advertising and visitor analytics require opt-in; Do Not Track and Global Privacy Control are honored. Administration uses authentication cookies. You can change your choice in the website footer.</p>");
  return pages;
}
function render(html: string, page: Page | undefined, path: string, base: string) {
  const privateRoute = /^\/(admin|sign-in|sign-up)(\/|$)/.test(path);
  const title = page?.title ?? (privateRoute ? "Owner Access | KTAS Tools" : "Page Not Found | KTAS Tools");
  const description = page?.description ?? "KTAS Tools: free PDF, Word, Excel, image and text utilities.";
  const canonical = `${domain}${page?.path ?? path}`;
  const schema = page?.tool ? {
    "@context": "https://schema.org", "@type": "WebApplication", name: page.tool.name, description,
    url: canonical, applicationCategory: "UtilitiesApplication", operatingSystem: "Web browser",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  } : { "@context": "https://schema.org", "@type": "WebSite", name: "KTAS Tools", url: domain, description };
  const tags = `<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="${page && !privateRoute ? "index, follow" : "noindex, nofollow"}">
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="KTAS Tools">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">
${page ? `<script id="seo-structured" type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>` : ""}`;
  let output = html.replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']*)["']|property=["']og:[^"']*["'])[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("</head>", `${tags}</head>`);
  const nav = ["/", "/pdf", "/word", "/excel", "/image", "/text"].map((route, index) => link(`${base}${route}`, ["KTAS Tools", "PDF", "Word", "Excel", "Image", "Text"][index]!)).join(" · ");
  const body = `<section style="max-width:1100px;margin:40px auto;padding:24px;color:#143b3e;font-family:system-ui,sans-serif"><nav>${nav}</nav><h1>${escape(page?.tool?.name ?? title.replace(/\s*\|\s*KTAS Tools$/, ""))}</h1><p>${escape(description)}</p><noscript><p>Enable JavaScript to run the tools. PDF, Word and Excel documents are processed temporarily on KTAS servers; image and text processing happens in your browser.</p></noscript>${page?.body ?? ""}</section>`;
  output = output.replace(/<div id=["']root["']>[\s\S]*?<\/div>/, `<div id="root">${privateRoute ? "" : body}</div>`);
  return output;
}

export function seoPlugin(): Plugin {
  let base = "";
  let pages = pagesFor(installedTools);
  return {
    name: "ktas-route-seo",
    configResolved(config) { base = config.base.replace(/\/$/, ""); },
    async buildStart() {
      // Builds take a snapshot of the owner's current public catalog where available.
      if (!process.env.REPLIT_DEV_DOMAIN) return;
      try {
        const response = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api/tools`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const current = await response.json() as Tool[];
        if (!Array.isArray(current) || !current.every((tool) => ["pdf", "word", "excel", "image", "text"].includes(tool.section ?? ""))) throw new Error("The live catalog does not support all tool sections yet.");
        pages = pagesFor(current);
      } catch (error) {
        this.warn(`SEO uses the installed tool catalog because the current public catalog could not be read: ${error instanceof Error ? error.message : String(error)}. Rebuild after owner changes to refresh static SEO.`);
      }
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const requestPath = context.originalUrl ?? context.path;
        const path = (requestPath === "/index.html" ? "/" : requestPath.replace(base, "")).split("?")[0]!.replace(/\/$/, "") || "/";
        const legacy = installedTools.find((tool) => tool.section === "pdf" && path === `/${tool.slug}`);
        return render(html, pages.get(legacy ? `/pdf/${legacy.slug}` : path), path, base);
      },
    },
    generateBundle: { order: "post", handler(_options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") throw new Error("Missing index.html for static SEO pages.");
      const shell = String(index.source);
      for (const page of pages.values()) {
        if (page.path === "/") continue;
        this.emitFile({ type: "asset", fileName: `${page.path.slice(1)}/index.html`, source: render(shell, page, page.path, base) });
      }
      for (const path of ["/admin", "/sign-in", "/sign-up"]) {
        this.emitFile({ type: "asset", fileName: `${path.slice(1)}/index.html`, source: render(shell, undefined, path, base) });
      }
      this.emitFile({ type: "asset", fileName: "404.html", source: render(shell, undefined, "/404", base) });
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages.keys()].map((path) => `<url><loc>${domain}${path}</loc></url>`).join("")}</urlset>`;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
    } },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === `${base}/sitemap.xml`) {
          res.setHeader("Content-Type", "application/xml");
          res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages.keys()].map((path) => `<url><loc>${domain}${path}</loc></url>`).join("")}</urlset>`);
          return;
        }
        next();
      });
    },
  };
}