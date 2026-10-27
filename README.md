# KTAS Tools — Fullstack Node.js Edition

A complete, free, privacy-first toolkit for **PDF**, **Word**, **Excel**, **Image**, and **Text** processing, rebuilt as a **100% pure Node.js fullstack application**.

---

## ✨ Features & Architecture

- **100% Pure Node.js & TypeScript**: No Python runtime, Nix, or external system binaries required.
- **Pure JavaScript Document Engines**:
  - **PDF Engine (`pdf-lib`)**: Merge, split, organize, rotate, watermark, page numbering, crop, edit, sign, metadata, blank pages, and more.
  - **Excel Engine (`xlsx` / SheetJS)**: Inspect workbooks, merge workbooks, split sheets, convert to/from CSV, deduplicate rows, remove empty rows, trim cell text, statistics, and JSON export.
  - **Word Engine (`adm-zip` OpenXML)**: Text to Word DOCX, extract text, extract tables to CSV, extract images, document statistics, metadata, find & replace, and comment cleaning.
  - **Image & Text Engines**: Fast, zero-upload, client-side processing directly in the browser canvas and Web APIs.
- **Embedded SQLite Database**: Automatically initialized local database (`data/ktas.db`) via Node's native SQLite engine (`node:sqlite`). Zero setup, no PostgreSQL server required.
- **Fullstack Structure**:
  - `server/`: Express.js backend with REST API and static frontend serving.
  - `client/`: React 19 + Vite + Tailwind CSS + Lucide Icons + Wouter.
  - `shared/`: Shared TypeScript types, Zod schemas, and tool catalogs.
  - `data/`: Persistent local SQLite database storage.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20 or newer (v22 recommended)
- **npm**: v10 or newer

### 2. Installation
Install all dependencies using standard npm:
```bash
npm install
```

### 3. Development
Start both the backend API server and Vite frontend simultaneously:
```bash
npm run dev
```
- Frontend dev server: `http://localhost:3000`
- Backend API server: `http://localhost:5000` (requests to `/api` are automatically proxied)

### 4. Production Build & Start
Build the client and start the production server:
```bash
# Build the React frontend
npm run build

# Start the unified production server
npm start
```
The server will start at `http://localhost:5000` and serve both the REST API and the production frontend single-page application.

---

## 🛠 Available Scripts

| Command | Description |
|---|---|
| `npm install` | Install all backend and frontend dependencies |
| `npm run dev` | Run backend and Vite dev servers concurrently |
| `npm run backend` (or `npm run dev:server`) | Run **only** backend API server (port 5000) |
| `npm run frontend` (or `npm run dev:client`) | Run **only** Vite frontend dev server (port 3000) |
| `npm run build` | Build the frontend for production |
| `npm start` | Start the production server on port 5000 |

---

## 📁 Project Directory Structure

```
KTAS-Tools/
├── client/                     # React 19 + Vite frontend
│   ├── src/                    # Pages, components, hooks, styles
│   │   ├── api-client/         # Generated API client
│   │   ├── components/         # UI components & tool forms
│   │   ├── pages/              # Catalog, Tool, Admin, Info pages
│   │   └── lib/                # Client-side Image & Text engines
│   ├── public/                 # Static assets (favicons, logos)
│   └── vite.config.ts          # Vite configuration with proxy
├── server/                     # Express.js backend
│   ├── engine/                 # Native Node.js document processors
│   │   ├── pdf-engine.ts       # pdf-lib PDF processing
│   │   ├── excel-engine.ts     # SheetJS Excel processing
│   │   └── word-engine.ts      # OpenXML Word processing
│   ├── routes/                 # REST API routes
│   │   ├── tools.ts            # Processing endpoints & tool directory
│   │   ├── admin.ts            # Owner panel & settings
│   │   ├── analytics.ts        # Consented privacy analytics
│   │   └── health.ts           # Health check endpoint (/api/healthz)
│   ├── db/                     # SQLite database (node:sqlite)
│   ├── middlewares/            # Admin auth & CORS protection
│   ├── app.ts                  # Express application setup
│   └── index.ts                # Server entrypoint
├── shared/                     # Shared types, Zod schemas & catalogs
│   ├── catalogs/               # Definitions for 150+ tools
│   ├── schemas/                # Shared Zod validation schemas
│   └── types/                  # Shared TypeScript interfaces
├── data/                       # SQLite storage directory (ktas.db)
├── package.json                # Unified npm dependencies & scripts
└── tsconfig.json               # Root TypeScript configuration
```

---

## 🔒 Privacy & Security

- **Temporary Processing**: Files are processed in memory and temporary storage, and are never retained after a request completes.
- **Client-Side Image & Text Tools**: Image modifications and text manipulation occur 100% in the user's browser without uploading files to the server.
- **Private SQLite Storage**: Tool customizations, advertising settings, and visitor stats are stored locally in `data/ktas.db`.
