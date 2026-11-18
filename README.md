# Multiwatch (Vue 3 + Vite)

Watch several YouTube, Twitch, and Kick streams side by side in one grid.

## Features

- **1 to 60 screens.** First run asks how many screens you want (default 12).
  Every screen is a separate embedded player, so 60 screens is very heavy.
- **Mirror mode (on by default).** Paste a URL once and it fills every screen.
  If you have not picked a screen count yet, the first paste fills 12. Pasting a
  new URL replaces the whole wall; the previous URL is remembered, so changing
  12 screens to 60 re-fills all 60 with the same stream.
- **Session persistence.** Screen count, layout, mirror mode, the current video,
  and the broadcast source are saved in `localStorage`, so they come back after
  a refresh. The last URL keeps running until you replace or clear it.
- **Playback counter.** Each start of a video — adding a URL, or loading the
  wall — counts one run for that source on this device. The count shows as a
  small `▶ N` badge on every panel and in Session settings, where it can be
  reset. It counts starts in this app, not YouTube's official view count.
- **Background playback (best effort).** While the tab is hidden or the window
  loses focus — including a Windows virtual-desktop switch — YouTube players are
  nudged to keep playing immediately and every 10 seconds, and returning to the
  tab asks them to continue from where they were instead of re-creating them.
  Nothing restarts like a page reload. A frozen or discarded tab still depends
  on the launcher below, because a web page cannot override the browser.
- **Shared wall state (optional).** Run the included server and the current
  source, screen count, mirror mode and layout are stored server-side. A device
  that opens the site adopts that wall on load, and local changes are pushed
  back (last write wins). A share-link view never overwrites it. Without the
  server it falls back to `localStorage` silently.
- **Share links.** The Share button copies a URL containing the session
  (`v`, `layout`, `screens`, and `mirror`). Mirror links stay short by storing
  only one source.
- **Looping YouTube videos.** YouTube embeds use `loop=1`, so regular videos
  repeat until you change the URL. Twitch and Kick live streams run
  continuously; Twitch VODs and clips still stop at the end.
- **Supported links.** YouTube `watch?v=`, `youtu.be`, Shorts, `/live/`,
  `/embed/` and `/v/` links; Twitch channels, VODs and clips; Kick live channels.
  Kick VOD pages are rejected because the public Kick player only embeds a
  channel, and other site pages (Twitch `/directory`, Kick `/video/…`, …) are
  rejected instead of being embedded as a channel name.
- **Always active (best effort).** Holds a Screen Wake Lock and plays a
  near-silent audio loop so the display does not sleep and the tab is less
  likely to be frozen while backgrounded. It defaults to on.
- **Rotating streams.** Optionally re-create every player on a timer (15 min,
  30 min, 1 hour, or 2 hours). This is useful for stale streams. It is **not**
  an IP proxy.
- **Layouts.** Auto, Focus, Rows, and Columns. Auto follows the screen count;
  the other presets override it.
- **Themes.** Dark and light.

## Important limitations

- **A web page cannot change your IP address.** The proxy/gateway fields only
  route the iframe URL through a gateway you host yourself. JavaScript cannot
  apply an HTTP proxy to a cross-origin YouTube/Twitch iframe. Do not expect
  the proxy fields to hide your IP.
- **Background playback is not guaranteed.** Browsers may pause or throttle a
  hidden tab, and Windows can still sleep or suspend the browser. Wake Lock
  only keeps the *display* awake. See "Running a wall unattended" below for the
  launcher that actually addresses this.
- **No 24/7 server-side playback.** The *state* can live on a server, but the
  video still needs a real browser. A static SPA cannot run without one,
  serverless hosts only run functions on request, and running a headless
  browser against streaming platforms violates their terms.
- **Do not use this to inflate views.** Running the same video on many screens
  with rotating proxies is view manipulation, violates platform rules, and can
  get accounts or channels banned.

## Running a wall unattended

Switching to another app makes browsers throttle hidden tabs, and Windows will
eventually sleep the machine. Neither can be fixed from inside the page, so
there is a launcher that fixes both from outside the browser:

```powershell
npm run dev                 # terminal 1: serve the app
npm run wall                # terminal 2: open the wall window
```

`scripts\start-multiwatch.ps1` (or double-click `scripts\start-multiwatch.cmd`)
does four things:

1. starts Chrome or Edge with `--disable-background-timer-throttling`,
   `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`
   and Memory Saver / occlusion detection disabled, so the wall keeps rendering
   while another window has focus;
2. uses a dedicated browser profile (`%LOCALAPPDATA%\Multiwatch\browser-profile`)
   so those flags do not affect your normal browsing;
3. calls `SetThreadExecutionState` with `ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED`
   while the window is open, so the PC does not sleep — and always releases it
   on exit, even with Ctrl+C;
4. optionally pins the window: `npm run wall -- -AlwaysOnTop`.

Use `npm run wall:preview` to point it at a `vite preview` build on port 4173
instead of the dev server. If your preview runs on another port, pass it
explicitly:

```powershell
npm run build
npx vite preview --port 4180 --strictPort   # terminal 1
npm run wall -- -Url http://localhost:4180  # terminal 2
```

Switching Windows virtual desktops makes the wall window invisible. A normal
Chrome window can still pause playback, throttle timers, or discard the tab
under memory pressure. No page script can prevent that. The app now nudges
players on `blur`/`focus` as well as `visibilitychange`, but the launcher's
browser flags are what stop Chrome from backgrounding the window in the first
place. In Chrome settings also turn off **Memory Saver** (or add the site to
“Always keep these sites active”), and in Windows turn off **Energy Saver** if
it is throttling background apps.

### Routing through a proxy

Only the whole browser can be proxied — a page cannot proxy a cross-origin
iframe, and there is no per-screen proxy setting that would work. The launcher
takes one proxy for everything:

```powershell
npm run wall -- -ProxyList .\scripts\proxies.example.txt        # pick one from a file
npm run wall -- -ProxyList .\my-proxies.txt -Shuffle            # random working one
npm run wall -- -Proxy socks5://1.2.3.4:1080                    # one specific proxy
npm run wall -- -ProxyCountry IN                                # fetch + test from Proxifly
npm run wall -- -ProxyList .\my-proxies.txt -ProxyOnly          # resolve, print, exit
```

**Proxy list format** (`-ProxyList`, alias `-ProxyFile`): plain text, one entry
per line. `socks5://1.2.3.4:1080`, `socks4://…`, `http://…`, `https://…`, or bare
`1.2.3.4:1080` which uses `-ProxyScheme` (default `socks5`). Blank lines and `#`
comments are ignored, and a comment can trail an entry. Credentials
(`user:pass@host:port`) are skipped — Chrome's `--proxy-server` cannot carry
them. See `scripts/proxies.example.txt`.

In the app, **Settings → Proxy gateways** is a different thing: it only accepts
URL-rewriting gateways such as `https://proxy.example/embed?url={url}`. Raw
`http://1.2.3.4:8080` / `socks5://1.2.3.4:1080` entries are rejected and removed
from saved settings, because an iframe cannot use them and they would break
every screen. Automatic proxy-list fetching inside the browser is not included:
public APIs are CORS-blocked, and shipping an API key in a static bundle exposes
it to everyone.

Each candidate is tested by fetching its exit IP through it; dead entries are
skipped until one works, then `-Shuffle` picks a different starting point next
launch. `-MaxProxyTries` (default 40) caps how many are tried.

`-ProxyCountry` builds the list from `proxifly/free-proxy-list`, ranking
elite > anonymous > transparent and HTTPS-capable first, and additionally
verifies the exit country.

**Measured 2026-11-01 — the free list is not usable for this:**

| Check | Result |
| --- | --- |
| Indian entries in the list | 256 |
| Of those, `elite` (hides your IP) | 0 — all 256 are `transparent` |
| Candidates tested across IN + US + file | 30+ |
| Candidates that completed a TLS connection | 0 |
| Direct connection (no proxy) | worked |
| Local CONNECT proxy, same code path | selected and verified correctly |

Transparent proxies forward your real IP in headers, so they would not hide
anything even if they connected. The resolver itself is verified working — a
local CONNECT proxy was picked out of a list containing a dead entry, with its
exit IP and country confirmed. The free list simply has nothing alive. For a
wall that has to stay up, pass `-Proxy`/`-ProxyList` with a paid endpoint.

Per-screen proxy rotation is deliberately not implemented: it cannot be done
from a browser page, and rotating proxies per viewer is view manipulation.

## Shared state (24/7)

Optional. Keeps the current wall on a server so it survives reboots and follows
you between machines. Only one small object is stored: source URL, screen
count, mirror mode, layout. No history, no accounts.

```bash
npm run build
npm run serve        # http://localhost:8787  (state backend: file)
```

`GET /api/state` returns the stored wall (or `{"empty":true}`), `PUT /api/state`
replaces it. `GET /api/health` reports which backend is active.

With `npm run dev` in another terminal, Vite proxies `/api` to port 8787, so the
app syncs while you develop. `vite preview` uses the same proxy rule by default.
If nothing is listening the app reports "offline" and behaves exactly as before.

### Deploying

**Vercel + Upstash** (primary target):

1. Create a Redis database at Upstash and copy its REST URL and token.
2. Import the repo into Vercel with root directory `multiwatch`.
3. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as environment
   variables. Build is `npm run build`, output `dist` (already in `vercel.json`).

`api/state.js` is the serverless endpoint. Without those two variables it
returns a clear `503` instead of silently dropping writes.

**Railway** (same code, no third-party DB):

1. Create a service from the repo, root directory `multiwatch`.
2. Build `npm run build`, start `npm run serve`.
3. Attach a volume mounted at `/app/data` so the JSON store survives deploys.

The backend is chosen at runtime: Upstash when the env vars exist, otherwise the
file store (`MULTIWATCH_DATA_FILE` overrides the path).

**Security note:** the endpoint is public. Anyone who knows the URL can change
the wall. There is no secret to configure on purpose — a token shipped in a
static bundle is readable by every visitor, so it would be theatre. Put the
deployment behind Vercel password protection or Cloudflare Access if that
matters to you.

## Development

```bash
npm install
npm run dev
```

Production build and preview:

```bash
npm run build
npx vite preview --port 4173 --host 127.0.0.1
```

## Structure

- `src/stores/videos.js` - session state, screen count, mirror mode, share URLs
- `src/composables/useEmbedFactory.js` - URL parsing and embed URLs
- `src/composables/useKeepAwake.js` - wake lock + silent audio
- `src/composables/useResume.js` - keeps hidden players playing, without reloads
- `src/composables/useCloudSync.js` - adopts/pushes the shared wall state
- `src/composables/useRotation.js` - timed player refresh / gateway templates
- `server/store.js` - state storage (Upstash REST or a JSON file)
- `server/index.js` - static server + `/api/state` for Railway/self-hosting
- `api/state.js` - the same endpoint as a Vercel serverless function
- `scripts/start-multiwatch.ps1` - launcher: no throttling, no sleep, proxy
- `src/components/ScreenSetup.vue` - first-run and custom screen count
- `src/components/AppSettings.vue` - always active, screens, mirror, rotation
- `src/components/VideoGrid.vue` - grid and empty screen slots
