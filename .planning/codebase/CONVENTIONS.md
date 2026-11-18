---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
# Coding Conventions

**Analysis Date:** 2026-11-18

## Naming Patterns

**Files:**

- Vue Components: PascalCase matching the component tag name (e.g., `VideoPanel.vue`, `ToastNotification.vue`).
- Composables: camelCase prefixed with `use` (e.g., `useKeepAwake.js`, `useEmbedFactory.js`).
- Store Modules: camelCase naming the state domain (e.g., `videos.js`).
- Scripts: kebab-case indicating action and subject (e.g., `start-multiwatch.ps1`).

**Functions:**

- camelCase for all JavaScript functions and composable action methods (e.g., `extractYouTubeId()`, `toggleKeepAwake()`, `handleClearAll()`).
- Event handlers in Vue templates: prefixed with `handle` (e.g., `handleShare`, `handleAdd`) or descriptive action verbs (e.g., `reload`, `syncMute`).
- Pure utility / validation predicates: prefixed with `is` or `has` (e.g., `isHost()`, `isYouTubeId()`, `isValidSourceId()`, `isUsableGateway()`).

**Variables:**

- camelCase for standard reactive and non-reactive variables (e.g., `screenCount`, `mirrorMode`, `watchdogTimer`).
- UPPER_SNAKE_CASE for module-level constants and immutable configurations (e.g., `STORAGE_KEY`, `MAX_SCREENS`, `DEFAULT_SCREENS`, `PLATFORM_META`, `ALLOWED_MINUTES`).
- Reactive ref suffixes: DOM element references use `El` suffix (e.g., `inputEl`, `iframeEl`, `headerEl`).

**Types / Models:**

- The codebase uses standard modern JavaScript without TypeScript, but enforces strict object shape normalization at boundaries (`normalizeSource`, `normalizeVideo`).

## Code Style

**Formatting:**

- Indentation: 2 spaces (no tabs).
- Quotes: Single quotes `'` for JavaScript strings; double quotes `"` in HTML/Vue template attributes.
- Semicolons: Consistently used across all JavaScript files.
- Trailing commas: Used in multi-line object and array literals.
- Line width: Kept within 80-100 characters where possible, with detailed multi-line block comments.

**Linting:**

- No active ESLint/Biome configuration file committed. Clean, modern ES2020+ standards are followed manually.
- Native ES module syntax: `"type": "module"` in `package.json`, using explicit `import ... from '...'` and standard node specifiers (e.g., `node:http`, `node:fs`).

## Import Organization

**Order:**

1. External package imports (Vue core, Pinia, third-party libraries: `vue`, `pinia`, `vuedraggable`).
2. Node standard library imports in backend files (`node:http`, `node:fs`, `node:path`, `node:url`).
3. Internal Vue components (`./components/*`).
4. Internal composables (`./composables/*`).
5. Internal stores (`./stores/*`).
6. Style imports (`./assets/styles/*`).

**Path Aliases:**

- `@` is configured in `vite.config.js` to resolve to `<root>/src`.
- Relative imports (`./` and `../`) are used within sibling composables and component trees.

## Error Handling

**Patterns:**

- **Boundary Sanitization:** Never trust external input directly. Inputs from URL query parameters, `localStorage`, or server sync are sanitized through dedicated normalizers (`normalizeSource`, `normalizeVideo`, `loadRunStats`).
- **Defensive Parsing:** JSON parsing operations are always wrapped in `try/catch` blocks with explicit fallbacks to safe defaults (`null`, `[]`, or `{}`) to prevent corrupt storage from breaking rendering.
- **Fail-Safe Serverless Execution:** Serverless endpoints verify prerequisites early (e.g., checking for writable backend in `api/state.js`) and return structured JSON errors with HTTP status codes (400, 405, 503) and remediation hints.
- **Atomic File Operations:** Backend file writes in `server/store.js` write to a temporary file (`.tmp`) before renaming, wrapped in a sequential Promise chain to prevent partial or corrupted file writes.

## Logging

**Framework:**

- Native `console` methods (`console.log`, `console.error`).

**Patterns:**

- Minimal logging in production client code to keep DevTools clean.
- Informational logging on server initialization announcing active port and storage backend (`server/index.js:145`).
- User-facing notifications dispatched through the reactive toast composable (`useToast().success(...)`, `useToast().error(...)`, `useToast().info(...)`).

## Comments

**When to Comment:**

- Crucial architecture decisions: Detailed file header blocks explaining browser limitations, why specific approaches were chosen, and platform terms of service constraints (e.g., `useKeepAwake.js`, `useResume.js`, `useRotation.js`).
- Workarounds for browser quirks: Explaining audio context suspension, background timer throttling, and why `postMessage` is used instead of re-creating iframes.
- Win32 API interactions: Detailed PowerShell documentation headers (`.SYNOPSIS`, `.DESCRIPTION`, `.EXAMPLE`) in `scripts/start-multiwatch.ps1`.

**JSDoc/TSDoc:**

- Concise block comments documenting public composables and utility signatures.

## Function Design

**Size:**

- Single responsibility functions. Most helpers and validators are between 5 and 30 lines.
- Complex state transitions in Pinia are decomposed into focused actions (`addVideo`, `removeVideo`, `setScreenCount`, `setLayout`, `recordRun`).

**Parameters:**

- Functions with multiple options accept a configuration object (e.g., `initCloudSync(store, { adopt, push })`).
- Primitive validators take direct values (e.g., `isValidSourceId(type, subtype, sourceId)`).

**Return Values:**

- Normalization functions return the sanitized object or `null` if invalid.
- Predicates return strict booleans (`true`/`false`).
- Async storage functions return Promises resolving to payload or boolean success flags.

## Module Design

**Exports:**

- Composables export named functions (`export function useKeepAwake()`) or individual reactive properties.
- Pinia stores export a named store hook (`export const useVideosStore = defineStore(...)`).
- Server utility modules use named exports (`export { readState, writeState, backend }`).

**Barrel Files:**

- No barrel files (`index.js` re-exporting multiple modules). Files are imported directly from their concrete locations (e.g., `import { useToast } from './composables/useToast.js'`).

---

*Convention analysis: 2026-11-18*
