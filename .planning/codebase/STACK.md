---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
# Technology Stack

**Analysis Date:** 2026-11-18

## Languages

**Primary:**

- JavaScript (ES2020+ / ESM) - Frontend application logic (`src/`), standalone HTTP server (`server/index.js`, `server/store.js`), and serverless function (`api/state.js`). All projects use native `"type": "module"`.

**Secondary:**

- PowerShell (Windows PowerShell 5.1+ / PowerShell Core 7+) - Background process and window management automation scripts (`scripts/start-multiwatch.ps1`).
- CSS3 - Scoped component styles and global CSS custom properties / theme variables (`src/assets/styles/main.css`).
- HTML5 - Application shell (`index.html`).
- Batch - Windows shortcut wrapper (`scripts/start-multiwatch.cmd`).

## Runtime

**Environment:**

- Node.js (v18+ or v20+ recommended for native ESM, `fetch`, and `node:*` modules).
- Browser: Modern evergreen Chromium, Firefox, or Safari (requires ES2020 support, Screen Wake Lock API, and Web Audio API for background keep-alive).

**Package Manager:**

- npm (v9+ / v10+)
- Lockfile: `package-lock.json` present (version 3 format).

## Frameworks

**Core:**

- Vue 3 (`vue@^3.5.25`) - Reactive UI framework using Composition API (`<script setup>`).
- Pinia (`pinia@^3.0.4`) - State management for video streams, session configurations, and local counters.
- vuedraggable (`vuedraggable@^4.1.0`) - Drag-and-drop video panel reordering built on SortableJS.

**Testing:**

- Framework: Not configured / Not detected (no testing framework installed in `package.json`).

**Build/Dev:**

- Vite (`vite@^7.3.1`) - Fast dev server with Hot Module Replacement and production bundling.
- `@vitejs/plugin-vue` (`@vitejs/plugin-vue@^6.0.2`) - Vue 3 Single File Component compiler plugin for Vite.

## Key Dependencies

**Critical:**

- `vue` (`^3.5.25`) - Core application rendering engine, reactive refs/computeds, and lifecycle hooks (`src/App.vue`, `src/components/*`).
- `pinia` (`^3.0.4`) - Central store for stream URLs, screen counts, playback metrics, and layouts (`src/stores/videos.js`).
- `vuedraggable` (`^4.1.0`) - Interactive grid slot re-ordering (`src/components/VideoGrid.vue`).

**Infrastructure & Zero-Dependency Modules:**

- `server/index.js`: Custom Node.js HTTP server built entirely on native standard libraries (`node:http`, `node:fs`, `node:path`, `node:url`). Zero external server framework dependencies (no Express, Fastify, or Koa).
- `server/store.js`: Dual-backend persistence layer using standard `fs/promises` for local JSON (`data/state.json`) or native `fetch` for Upstash Redis REST API.

## Configuration

**Environment:**

- Configured via environment variables and optional runtime parameters:
  - `PORT`: Server port (defaults to `8787` in `server/index.js`).
  - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST endpoint for remote state persistence.
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis bearer token.
  - `MULTIWATCH_DATA_FILE`: Optional override path for local JSON store (defaults to `data/state.json`).

**Build:**

- `vite.config.js`:
  - Path alias `@` mapped to `src/`.
  - Target: `es2020` for modern browser output.
  - Chunk splitting: Splits `vue` (`vue`, `pinia`) and `draggable` (`vuedraggable`) into separate vendor chunks.
  - Dev server proxy: Proxies `/api` to `http://127.0.0.1:8787` so SPA and server share the same origin during development.
- `vercel.json`:
  - Framework: `vite`.
  - Build command: `npm run build`.
  - Output directory: `dist`.
  - Serverless function timeout: 10s for `api/state.js`.

## Platform Requirements

**Development:**

- Node.js v18.0.0+ and npm.
- Windows 10/11 for execution of PowerShell launcher scripts (`scripts/start-multiwatch.ps1`).

**Production:**

- Static Hosting (Frontend): Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static file server.
- Full Stack (with shared wall sync):
  - Option A: Standalone Node.js server (`server/index.js`) deployed to Railway, Render, Fly.io, or VPS.
  - Option B: Vercel Serverless Function (`api/state.js`) paired with an Upstash Redis database.

---

*Stack analysis: 2026-11-18*
