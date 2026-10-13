# Workbook picker browser regressions

From the workspace root:

```sh
pnpm test:workbook-browser
pnpm typecheck:workbook-browser
```

The suite starts its own test-only Vite server on port 5190 and mounts the real
`ToolPage` (including `WorkbookPreview`) with the real generated API client and
React Query. It does not need the API server, a database, Clerk credentials, or
worksheet processing engines. It never changes owner settings or live data.
The fixture is not an entry point in the production build.

Replit's Chromium is used automatically. On other machines install Playwright's
Chromium (`pnpm exec playwright install chromium`) or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing compatible executable.

Catalog, site configuration, and processing responses are controlled fixtures;
assertions check actual serialized inspection and processing requests. Uploads
contain small marker strings rather than real XLSX packages: this suite tests the
client lifecycle, not parsing safety or duplicate matching. The Python workbook
safety suite remains responsible for those server-side concerns.

Inspection promises are explicitly delivered by each test. The fake transport
records abort signals but deliberately still delivers late success/error
responses, so the tests prove the component cannot repopulate cleared or replaced
previews even when cancellation does not stop a response. Each test has its own
browser context and fixtures, with no arbitrary sleeps or live external APIs.

Coverage includes all-sheet defaults, exact identifiers (spaces, apostrophe,
comma, Unicode and hidden worksheet), independent preview/processing pickers,
same-name replacement, removal/re-upload, rejected replacement, late responses,
superseded requests, error/retry, merge switching, and merge order/removal.
Failure screenshots and traces are saved in `test-results`; the HTML report is in
`playwright-report` (both ignored by Git).