---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
# Codebase Concerns

**Analysis Date:** 2026-11-18

## Tech Debt

**Lack of Automated Testing Suite:**

- Issue: Zero test files or test runner configured in the project (`package.json` contains no `test` script).
- Files: All source files (`src/composables/useEmbedFactory.js`, `src/stores/videos.js`, `server/store.js`).
- Impact: High regression risk when modifying platform URL regexes, state normalization, or persistence code.
- Fix approach: Install `vitest` and `@vue/test-utils`, add automated unit tests for URL parsers and store actions, and integrate into npm scripts.

**Unauthenticated Server State Endpoint:**

- Issue: `/api/state` allows arbitrary `PUT` and `POST` updates without token authentication, IP whitelisting, or rate limiting.
- Files: `server/index.js`, `api/state.js`, `server/store.js`.
- Impact: In shared or public deployments (e.g. Vercel or Railway), anyone who discovers the domain can overwrite the active wall state or clear it.
- Fix approach: Add optional API key or secret header verification for write operations (`X-Multiwatch-Key`), while keeping read operations open.

**Duplicated Serverless / Server Store Contract:**

- Issue: Backend selection and error checking logic is split between `server/store.js` and `api/state.js`.
- Files: `server/store.js:25`, `api/state.js:20`.
- Impact: Maintenance overhead and subtle divergence if backend storage options evolve.
- Fix approach: Consolidate backend health and capability queries into helper functions inside `server/store.js`.

## Known Bugs

**Twitch Embed Parent Mismatch on Custom IP / Non-Localhost Access:**

- Symptoms: Twitch player displays a blank error: "This video cannot be embedded because the parent domain is invalid."
- Files: `src/composables/useEmbedFactory.js:126`, `src/components/VideoPanel.vue:37`.
- Trigger: Accessing the application via local network IP (e.g., `http://192.168.1.50:5173`) rather than `localhost` or a registered domain name.
- Workaround: Access the application via `http://localhost:5173` or set up a local hosts entry mapping a domain name.

**Fixed 16:9 Aspect Ratio on Vertical Streams:**

- Symptoms: YouTube Shorts or TikTok-style vertical live streams appear heavily pillar-boxed with massive black bars on left and right.
- Files: `src/assets/styles/main.css`, `src/components/VideoPanel.vue:5`.
- Trigger: Adding a YouTube Shorts link (`https://www.youtube.com/shorts/...`).
- Workaround: Use standard 16:9 video links or adjust custom CSS.

## Security Considerations

**Permissive Iframe Sandbox Permissions:**

- Risk: Iframes are granted wide browser features (`allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"`).
- Files: `src/components/VideoPanel.vue:39`.
- Current mitigation: `iframe` sources are strictly restricted to whitelisted platform domains (YouTube, Twitch, Kick) via `useEmbedFactory.js`.
- Recommendations: Keep domain whitelisting strict; never allow arbitrary user-defined URLs inside `<iframe>` tags unless verified by safe gateway templates.

**Potential SSRF / Open Proxy via Gateway Templates:**

- Risk: In `AppSettings.vue`, users can configure proxy rewriting gateways containing `{url}` templates.
- Files: `src/composables/useRotation.js:28`.
- Current mitigation: Regex validation verifies that gateway inputs are valid HTTP/HTTPS URLs and rejects raw IP addresses.
- Recommendations: Ensure gateways are only allowed for HTTPS endpoints.

## Performance Bottlenecks

**Renderer Resource Exhaustion at High Screen Counts (16 to 60 Screens):**

- Problem: Severe CPU, GPU memory, and network bandwidth saturation leading to browser tab crashes or OS-level freezing.
- Files: `src/components/VideoGrid.vue`, `src/components/VideoPanel.vue`, `src/components/ScreenSetup.vue`.
- Cause: Each screen instantiates an independent, isolated Chromium renderer process and video decoding pipeline with active JavaScript runtimes.
- Improvement path:
  1. Add a low-overhead thumbnail/placeholder mode when many screens are configured.
  2. Throttle or stagger iframe creation on wall load rather than mounting all 60 simultaneously.
  3. Keep warning banner prominent when user selects >16 screens (`AppSettings.vue:82`).

**Simultaneous Iframe Initialization Spike:**

- Problem: Network request congestion and browser thread blocking when 12+ iframes are mounted in the same render tick.
- Files: `src/components/VideoGrid.vue:15`.
- Cause: `v-for="video in store.videos"` renders all panels concurrently on mount.
- Improvement path: Introduce staggered mounting with `requestAnimationFrame` or `setTimeout` delays between batches.

## Fragile Areas

**Browser Background Playback and Sleep Prevention:**

- Files: `src/composables/useKeepAwake.js`, `src/composables/useResume.js`, `scripts/start-multiwatch.ps1`.
- Why fragile: Modern browsers (especially Chrome/Edge) continuously tighten aggressive power-saving, occlusion detection, and timer throttling rules for background tabs.
- Safe modification: When adjusting resume logic or audio contexts, always test both in-tab and across Windows virtual desktop switches. Rely on the launcher script (`scripts/start-multiwatch.ps1`) for unattended installations.
- Test coverage: Zero automated coverage.

**Drag-and-Drop DOM Manipulation of Iframes:**

- Files: `src/components/VideoGrid.vue:11`, `src/components/VideoPanel.vue`.
- Why fragile: HTML `<iframe>` elements re-load from scratch if their DOM parent changes or if their position in the DOM tree is mutated during drag operations.
- Safe modification: Ensure `vuedraggable` preserves stable `:key="video.id"` assignments and avoids unmounting nodes during sort transitions.
- Test coverage: Zero automated coverage.

## Scaling Limits

**Grid Screen Capacity:**

- Current capacity: Clamped at 60 screens (`MAX_SCREENS = 60` in `src/stores/videos.js:7`).
- Limit: Hardware ceiling (typically 12-24 screens on typical modern consumer laptops before frame drops).
- Scaling path: Introduce multi-process window splitting or canvas-based stream compositing for enterprise display walls.

**Shared Wall State Concurrency:**

- Current capacity: Single shared room / global state key (`multiwatch:state`).
- Limit: Last-write-wins; multiple simultaneous users will overwrite each other's changes.
- Scaling path: Introduce room IDs (e.g. `/api/state?room=room-123`) to support multi-tenant or multi-screen setups.

## Dependencies at Risk

**`vuedraggable@^4.1.0`:**

- Risk: Vue 3 wrapper around SortableJS that receives infrequent maintenance updates.
- Impact: Potential compatibility issues with future major Vue versions.
- Migration plan: Consider transitioning to `@formkit/drag-and-drop` or native SortableJS with direct Vue refs if needed.

## Missing Critical Features

**Multi-Room / Multi-Wall Persistence:**

- Problem: The server sync infrastructure only persists one global wall state.
- Blocks: Multiple teams, users, or distinct monitors managing different walls on the same deployed instance.

**Automated CI / Test Pipeline:**

- Problem: No GitHub Actions or CI pipeline configured to run builds or checks on pull requests.
- Blocks: Continuous integration verification.

## Test Coverage Gaps

**URL Parsing and Platform Validation (`useEmbedFactory.js`):**

- What's not tested: Extraction of YouTube video IDs from Shorts, Live, embed URLs, and Twitch channel/VOD/clip patterns.
- Files: `src/composables/useEmbedFactory.js`.
- Risk: Malformed or unexpected URL formats causing broken embeds or empty iframes.
- Priority: High.

**Store Normalization and Persistence (`videos.js`):**

- What's not tested: Corrupt localStorage recovery, screen clamping, duplicate ID handling, and mirror mode re-population.
- Files: `src/stores/videos.js`.
- Risk: Storage corruption preventing application launch.
- Priority: High.

**Server State Write Serialization (`server/store.js`):**

- What's not tested: Concurrent HTTP PUT requests to verify promise queue atomic write guarantees.
- Files: `server/store.js`.
- Risk: Race condition causing corrupted `state.json`.
- Priority: Medium.

---

*Concerns audit: 2026-11-18*
