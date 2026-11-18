---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
# External Integrations

**Analysis Date:** 2026-11-18

## APIs & External Services

**Streaming Embeds (Client-Side iframes):**

- **YouTube Embedded Player** - Embedded video and live stream playback.
  - SDK/Client: YouTube Iframe Embed API via `<iframe>` (`src/composables/useEmbedFactory.js`, `src/components/VideoPanel.vue`).
  - URL Format: `https://www.youtube-nocookie.com/embed/{videoId}?autoplay=1&mute=1&enablejsapi=1&loop=1&playlist={videoId}&origin={origin}`.
  - Interaction: Uses `postMessage` (`{"event":"command","func":"playVideo","args":""}`, `{"event":"command","func":"mute","args":""}`, `unMute`) to control playback without reloading.
- **Twitch Interactive Player** - Channel live streams, VODs, and clips.
  - SDK/Client: Twitch Embed Player via `<iframe>` (`src/composables/useEmbedFactory.js`).
  - URL Format: `https://player.twitch.tv/?channel={channel}&parent={hostname}&muted=true&autoplay=true` (or `video={vodId}` / `clips.twitch.tv/embed?clip={clipId}`).
  - Requirement: Requires exact `parent` hostname parameter matching `window.location.hostname`.
- **Kick Player** - Channel live stream embeds.
  - SDK/Client: Kick Embed Player via `<iframe>` (`src/composables/useEmbedFactory.js`).
  - URL Format: `https://player.kick.com/{channel}?muted=true&autoplay=true`.
  - Constraint: Channel streams only; VODs and non-channel routes are rejected.

**Proxy & IP List Providers (Launcher-Level):**

- **Proxifly Free Proxy List** - Public list for resolving live country-specific proxies.
  - Client: PowerShell `Invoke-RestMethod` (`scripts/start-multiwatch.ps1`).
  - URL: `https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/{CC}/data.json`.
  - Authentication: None required.
- **IP Exit Verifier** - Tests proxy connectivity before Chromium window launch.
  - Endpoints: `https://api.ipify.org`, `https://ipinfo.io/json`, `https://ifconfig.me/ip`.

## Data Storage

**Databases:**

- **Upstash Redis (REST API)**:
  - Purpose: Shared wall synchronization across multiple devices/sessions.
  - Connection: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables.
  - Client: Native `fetch` in `server/store.js` calling `/get/multiwatch:state` and `/set/multiwatch:state`.
  - Behavior: Used automatically when environment variables are present (standard on Vercel deployments).

**File Storage:**

- **Local Filesystem JSON**:
  - File: `data/state.json` (or path configured via `MULTIWATCH_DATA_FILE`).
  - Implementation: `server/store.js` uses atomic write-and-rename (`writeFile` to `.tmp` then `rename`) with sequential promise queueing (`writeQueue`) to prevent concurrency race conditions.

**Client Storage (localStorage):**

- `multiwatch_session`: JSON object containing `videos`, `layout`, `screenCount`, `mirrorMode`, `mirrorSource`.
- `multiwatch_runs`: Playback counter dictionary mapping source keys to `{ count, lastRunAt }`.
- `multiwatch_keep_awake`: Boolean flag (`1` or `0`) for always active mode.
- `multiwatch_rotation`: Configuration for stream refresh timer and gateway URL templates.
- `multiwatch_theme`: Theme preference (`dark` or `light`).

## Authentication & Identity

**Auth Provider:**

- None. Multiwatch operates without user accounts, logins, or sessions.
- State sharing is public and link-based via URL query parameters (`v`, `layout`, `screens`, `mirror`) or synchronized wall state via `/api/state`.

## Monitoring & Observability

**Error Tracking:**

- None / Local console only (`console.error` in stores and composables).

**Logs:**

- Standalone Node.js server logs port and active state backend to `stdout` (`server/index.js`).
- PowerShell launcher logs proxy tests and window state transitions to terminal (`scripts/start-multiwatch.ps1`).

## CI/CD & Deployment

**Hosting:**

- **Vercel**: Configured with `vercel.json` for frontend static assets and serverless handler in `api/state.js`.
- **Railway / Docker / VPS**: Supported via `npm run build && npm run serve` running `server/index.js`.
- **Static Hosting**: Supported for standalone frontend without server synchronization.

**CI Pipeline:**

- None currently configured in repository (no `.github/workflows`).

## Environment Configuration

**Required env vars:**

- For Standalone Server (`server/index.js`):
  - `PORT`: (Optional) Port for HTTP server (default: `8787`).
  - `MULTIWATCH_DATA_FILE`: (Optional) Path to JSON state file.
- For Vercel Serverless Sync (`api/state.js`):
  - `UPSTASH_REDIS_REST_URL`: REST API URL for Redis instance.
  - `UPSTASH_REDIS_REST_TOKEN`: REST API authentication token.

**Secrets location:**

- Platform deployment environment variables (e.g., Vercel Project Settings, Railway Variables).
- Note: No `.env` files are tracked in version control (enforced by `.gitignore`).

## Webhooks & Callbacks

**Incoming:**

- `GET /api/state`: Reads shared wall snapshot (`server/index.js`, `api/state.js`).
- `PUT /api/state` / `POST /api/state`: Updates shared wall snapshot.
- `GET /api/health`: Healthcheck endpoint reporting `{ ok: true, backend }`.

**Outgoing:**

- None.

---

*Integration audit: 2026-11-18*
