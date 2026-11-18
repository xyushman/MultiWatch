---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
<!-- refreshed: 2026-11-18 -->

# Architecture

**Analysis Date:** 2026-11-18

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Client Application (Vue 3 SPA)                    │
├─────────────────────┬──────────────────────┬────────────────────────────┤
│   AppHeader.vue     │   VideoGrid.vue      │     Modals & Overlays      │
│ `src/components/`   │ `src/components/`    │  `ScreenSetup`, `Settings` │
└──────────┬──────────┴──────────┬───────────┴─────────────┬──────────────┘
           │                     │                         │
           ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   State & Composable Services Layer                     │
│  `src/stores/videos.js` (Pinia Store)                                   │
│  `useEmbedFactory.js`  `useKeepAwake.js`  `useResume.js`                │
│  `useCloudSync.js`     `useRotation.js`   `useTheme.js`                 │
└──────────┬───────────────────────────────────────────────┬──────────────┘
           │                                               │
           ▼                                               ▼
┌───────────────────────────────┐     ┌───────────────────────────────────┐
│ Embedded Video Players        │     │ Persistence & Sync Backends       │
│ - YouTube Iframe API          │     │ - Browser localStorage            │
│ - Twitch Embedded Player      │     │ - Standalone Server (`server/`)   │
│ - Kick Embed Player           │     │ - Serverless Function (`api/`)    │
└───────────────────────────────┘     └─────────────────┬─────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │ Storage: `data/state.json`        │
                                      │ or Upstash Redis REST API         │
                                      └───────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `App.vue` | Root coordinator; initializes composables (`useKeepAwake`, `useRotation`, `useResume`, `useCloudSync`), orchestrates modals and initial run counter | `src/App.vue` |
| `AppHeader.vue` | Top navbar; URL input, screen count trigger, layout selector, keep-awake toggle, share link generator, and clear all | `src/components/AppHeader.vue` |
| `VideoGrid.vue` | Grid layout renderer; handles drag-and-drop ordering with `vuedraggable` and renders video slots or empty placeholders | `src/components/VideoGrid.vue` |
| `VideoPanel.vue` | Individual video container; embeds `iframe`, overlays controls (solo audio, reload, remove), and posts resume commands | `src/components/VideoPanel.vue` |
| `ScreenSetup.vue` | Modal dialog for choosing initial or ongoing grid screen counts (1 to 60) | `src/components/ScreenSetup.vue` |
| `AppSettings.vue` | Session configuration modal; manages keep-awake options, proxy rewriting gateways, stream rotation, and counters | `src/components/AppSettings.vue` |
| `EmptyState.vue` | Full-screen placeholder shown when zero videos and zero screens are configured | `src/components/EmptyState.vue` |
| `EmptySlot.vue` | Placeholder cell shown when active video count is less than configured screen slots | `src/components/EmptySlot.vue` |
| `ModalShell.vue` | Accessible modal wrapper dialog with backdrop blur, keyboard dismissal (Esc), and focus traps | `src/components/ModalShell.vue` |
| `ToastNotification.vue` | Reactive popup notifications for clipboard copy, errors, and sync status updates | `src/components/ToastNotification.vue` |

## Pattern Overview

**Overall:** Reactive Component-Based SPA with Unidirectional Data Flow, Centralized State Store, and Headless Composables.

**Key Characteristics:**

- **Store as Single Source of Truth:** `src/stores/videos.js` governs all video lists, layout modes, screen allocations, and playback telemetry.
- **Composition-Driven Behavior:** Platform detection, system wake lock, background tab watchdog, and network sync are encapsulated into pure, testable composable hooks in `src/composables/`.
- **Zero-Dependency Backend:** The backend sync service (`server/index.js`, `server/store.js`) relies solely on Node.js standard modules, omitting external server dependencies to keep deployment footprint tiny.

## Layers

**Presentation Layer:**

- Purpose: Render video grid, controls, and configuration overlays.
- Location: `src/components/`, `src/App.vue`.
- Contains: Vue 3 Single File Components (`.vue`) utilizing `<script setup>` syntax and scoped CSS.
- Depends on: State Store (`src/stores/videos.js`), Composables (`src/composables/*`).

**State & Composable Logic Layer:**

- Purpose: Manage state persistence, URL parsing, browser keep-alive policies, and stream rotation.
- Location: `src/stores/`, `src/composables/`.
- Contains: Pinia store definition and modular composition functions.
- Depends on: Web APIs (`localStorage`, `WakeLock`, `AudioContext`, `postMessage`).
- Used by: Presentation Layer.

**Backend & Serverless Layer:**

- Purpose: Provide optional persistent multi-device shared state and static asset delivery.
- Location: `server/index.js`, `server/store.js`, `api/state.js`.
- Contains: Vanilla Node.js HTTP server and Vercel serverless functions.
- Depends on: Node.js stdlib (`node:http`, `node:fs`), Upstash Redis REST.

**Launcher & Host Automation Layer:**

- Purpose: Configure OS-level power policies, disable Chromium background throttling, and route browser via proxies.
- Location: `scripts/start-multiwatch.ps1`, `scripts/start-multiwatch.cmd`.
- Contains: PowerShell scripts with Win32 API P/Invoke (`SetThreadExecutionState`, `SetWindowPos`).

## Data Flow

### Primary Request Path (Stream Addition)

1. User inputs URL in `AppHeader.vue` and submits form (`src/components/AppHeader.vue:12`).
2. Input is validated and parsed by `useEmbedFactory.js` (`src/composables/useEmbedFactory.js:154`).
3. Stream source object is dispatched to store action `addVideo()` (`src/stores/videos.js:296`).
4. If `mirrorMode` is active, `videos` array is updated to replicate the source across all configured `screenCount` slots (`src/stores/videos.js:304`).
5. Run counter increments for that source in `runStats` (`src/stores/videos.js:224`).
6. State is synchronously serialized to `localStorage` (`src/stores/videos.js:198`).
7. `useCloudSync.js` observer detects store change and debounces a `PUT /api/state` request (`src/composables/useCloudSync.js:106`).
8. `VideoGrid.vue` re-renders grid cells and initializes `VideoPanel.vue` iframes with unique keys (`src/components/VideoGrid.vue:15`).

### Secondary Flow: Background Tab Nudge & Resume

1. User switches tabs, minimizes window, or changes Windows virtual desktop (`src/composables/useResume.js:57`).
2. Event listeners (`visibilitychange`, `blur`, `resume`, `pageshow`) trigger `keepPlaying()` check (`src/composables/useResume.js:36`).
3. An immediate bump and recurring 10-second watchdog interval increment `resumeToken` (`src/composables/useResume.js:24`).
4. `VideoPanel.vue` watches `resumeToken` and dispatches `postMessage` command `playVideo` to YouTube embeds without destroying the iframe (`src/components/VideoPanel.vue:209`).

**State Management:**

- Pinia store (`src/stores/videos.js`) maintains reactive refs:
  - `videos`: Array of video objects (`id`, `type`, `sourceId`, `subtype`, `rawUrl`, `label`, `color`, `muted`).
  - `screenCount`: Target screen count (integer `1..60` or `null`).
  - `layout`: Display grid mode (`auto`, `focus`, `rows`, `cols`).
  - `mirrorMode`: Boolean determining whether single URL fills all screens.
  - `mirrorSource`: The single source template used during mirror replication.
  - `soloId`: ID of single unmuted video panel.
  - `runStats`: Local playback start counters.

## Key Abstractions

**Video Source Object (`normalizeSource`):**

- Purpose: Normalized internal representation of any streaming source regardless of input URL shape.
- Examples: `src/stores/videos.js:52`, `src/composables/useEmbedFactory.js:154`.
- Structure: `{ type: 'youtube'|'twitch'|'kick', sourceId: string, subtype: 'channel'|'vod'|'clip'|null, rawUrl: string, label: string, color: string }`.

**Embed Provider (`PARSERS`):**

- Purpose: Strategy pattern for extracting IDs and generating iframe URLs across disparate streaming sites.
- Examples: `src/composables/useEmbedFactory.js:105`.
- Pattern: Object dictionary containing `detect`, `parse`, and `buildEmbedUrl` closures.

**State Store Backend (`server/store.js`):**

- Purpose: Abstract persistence provider that switches between local JSON file system and remote Upstash Redis.
- Pattern: Adapter pattern with promise serialization queue (`writeQueue`).

## Entry Points

**Frontend Application:**

- Location: `src/main.js` -> `index.html`.
- Triggers: Browser page load.
- Responsibilities: Creates Vue app instance, attaches Pinia, imports global styles, and mounts `App.vue`.

**Server Sync API:**

- Location: `server/index.js` (Standalone Node server on port 8787).
- Triggers: `npm run serve` or deployment container start.
- Responsibilities: Serves built SPA files from `dist/` and handles `/api/state` and `/api/health`.

**Serverless API Handler:**

- Location: `api/state.js`.
- Triggers: HTTP request on Vercel deployment.
- Responsibilities: Handles `/api/state` using Upstash Redis.

**Windows Launcher:**

- Location: `scripts/start-multiwatch.cmd` / `scripts/start-multiwatch.ps1`.
- Triggers: Double-clicking `.cmd` or `npm run wall`.
- Responsibilities: Launches dedicated browser instance with flags, applies Win32 execution state locks, and resolves proxies.

## Architectural Constraints

- **Single Browser Process for Proxies:** A browser page cannot proxy individual cross-origin iframes. Proxies can only be applied to the entire browser process via the Chromium launcher (`scripts/start-multiwatch.ps1`).
- **Autoplay & Audio Policies:** Modern browsers block unmuted autoplay. All embeds must initialize in a `muted` state (`src/stores/videos.js:88`) to guarantee playback starts automatically.
- **Cross-Origin Iframe Boundaries:** Cannot directly inspect or manipulate DOM inside third-party players (YouTube, Twitch, Kick). Controls must rely on platform-supported iframe query parameters or `postMessage` contracts.
- **Vercel Ephemeral Filesystem:** The serverless environment has no persistent writable local disk; `api/state.js` strictly requires Upstash Redis when running in serverless mode.

## Anti-Patterns

### Re-creating Iframes on Background Resumption

**What happens:** Forcing a key change or `src` re-assignment on iframes when returning from background tabs or switching virtual desktops.
**Why it's wrong:** Causes players to reload from second zero, producing visual flickering and restarting videos like a page reload.
**Do this instead:** Use `postMessage` playback commands (`{"event":"command","func":"playVideo"}`) to nudge the existing player instance (`src/components/VideoPanel.vue:209`).

### Raw SOCKS/HTTP Proxy Injection into Iframe URLs

**What happens:** Users entering `http://ip:port` into web settings expecting the browser to route cross-origin iframes through it.
**Why it's wrong:** The browser rejects invalid protocols or loads raw IP addresses inside iframes, completely breaking the screen.
**Do this instead:** Validate and reject bare IP proxy entries in `src/composables/useRotation.js:28`, allowing only URL-rewriting gateways containing `{url}` templates.

## Error Handling

**Strategy:** Graceful degradation with non-intrusive UI fallbacks.

**Patterns:**

- Local Storage Resilience: `src/stores/videos.js:92` wraps storage operations in `try/catch` and validates JSON schemas against strict whitelists before assigning to state.
- Remote Sync Fallback: `src/composables/useCloudSync.js:92` falls back to `offline` silently if `/api/state` fails, leaving the user uninterrupted with `localStorage`.
- Sanitized Input Boundaries: `src/composables/useEmbedFactory.js` rejects malformed platform URLs, returning structured error messages to display directly under the input field.

## Cross-Cutting Concerns

**Logging:** Local browser console warnings; no external analytics or trackers are embedded.
**Validation:** Regex-based validation on all incoming video IDs, screen bounds (`1..60`), and layout identifiers.
**Theming:** Dark and light theme tokens managed via CSS custom properties on `:root` and `[data-theme="light"]` (`src/assets/styles/main.css`).

---

*Architecture analysis: 2026-11-18*
