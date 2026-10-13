# KTAS Tools

A free PDF, Word, image and text toolkit with local processing and a protected owner console for tools, advertising, and consented visitor reports. Intended domain: `ktastools.com`; selection does not mean the domain is connected or the app is published.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the managed API server (port 8080)
- `pnpm --filter @workspace/ktas-pdf run dev` — run the web frontend; the managed workflow supplies `PORT` and `BASE_PATH`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test:workbook-browser` — focused Chromium regressions for Excel worksheet pickers, file replacement/removal, late inspection responses, and merge previews; uses a test-only server, no live API or credentials
- `pnpm typecheck:workbook-browser` — check the browser suite and fixture; see `artifacts/ktas-pdf/tests/browser/README.md` for browser setup and coverage
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Owner login: Replit-managed Clerk. `ADMIN_EMAIL` is the owner allowlist; the server requires a matching verified email. Do not put its value in documentation or code.
- `SESSION_SECRET` supplies the server-only analytics HMAC key. Never expose it to the frontend.

## Owner console

- Open `/admin` or the footer's “Owner admin panel” link. Sign in with the configured owner email; create an account and verify it if needed. Other accounts have no admin rights.
- Tool directory: manage the 100 PDF, 18 Word, 12 image and 20 text tools with section filters. Change names/descriptions, visibility and popular selection; reset restores engine defaults. Hiding a tool removes its public workspace; hidden server engines also reject processing requests.
- Advertising: configure 21 actual website placements across the hub and PDF/Word/image/text sections as sponsored links or AdSense units. Global and per-placement enablement plus visitor consent are required. AdSense approval and a regional CMP may still be required before live third-party ads.
- Traffic: 7/30-day reports, daily totals, country/device/OS/browser/page/referrer breakdowns and paginated private visitor records. Reporting uses Asia/Kolkata. Counts include consented browsers only.
- IPs and visitor rows expire after 30 days; the owner can clear them earlier. Local geolocation may report Unknown, especially behind proxies/VPNs. No document data is tracked.
- Existing live hosting/domain stays untouched unless the user approves replacement.

## Public website and processing

- `/` is the shared homepage, `/tools` the global directory, and `/pdf`, `/word`, `/image`, `/text` the section catalogs. Tools use `/section/slug`; old single-slug PDF links remain supported.
- PDF and Word tools use local server engines and temporary files. Image/text tools run in the browser and do not send their content to processing endpoints or storage.
- Word tools operate on DOCX, except Text to Word (UTF-8 `.txt`). Merge uses docxcompose; all other operations use python-docx or safe in-memory XML/package edits. Existing Word-to-PDF and PDF-to-Word remain under `/pdf` and are linked from `/word`.
- Word packages are validated before parsing (no traversal, duplicate parts, XML entities, or oversized expanded packages). Extraction/conversion and privacy tools state their limits; core-metadata removal is not complete sanitization. No rendered Word previews or estimated page counts. Validate actual reopened outputs with `.pythonlibs/bin/python3 scripts/check-word-tools.py`.
- Image tools support still JPEG/PNG/WebP/BMP, up to 30 MB and 40 megapixels. JPEG flattens transparency to white. Fit-inside resize supports automatic dimensions; fill-and-crop/stretch require both dimensions.
- Text tools support up to 200,000 characters; comparisons at most 1,000 lines per input. JSON formatting rejects unsafe integers; Base64 is UTF-8-aware.
- The build emits crawlable HTML per public route and a sitemap with intended-domain canonicals. Static SEO uses the public catalog at build time when reachable; otherwise it warns and uses installed engine definitions. Rebuild/republish after owner tool changes to refresh static crawler content. Live tool visibility and processing access update independently through the API.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
