---
last_mapped_commit: 8c12aff40c04a1f469148f534518af14bd359f4a
last_mapped_at: 2026-11-18
---
# Testing Patterns

**Analysis Date:** 2026-11-18

## Test Framework

**Runner:**

- Currently not installed / Not detected in `package.json`.
- Recommended / Standard target for Vite + Vue 3: `vitest` with `@vue/test-utils`.
- Alternative lightweight option: Node.js built-in test runner (`node:test`, `node:assert`).

**Assertion Library:**

- None installed.

**Run Commands:**

```bash

# Currently no test script configured in package.json

# Recommended scripts to add:

npm test               # Run test suite
npm run test:watch     # Watch mode for development
npm run test:coverage  # Coverage report
```

## Test File Organization

**Location:**

- Currently absent.
- Recommended pattern: Co-located with source files (e.g., `src/composables/__tests__/useEmbedFactory.test.js`) or a top-level `tests/` directory separated into `unit/` and `integration/`.

**Naming:**

- Recommended: `*.test.js` or `*.spec.js`.

**Structure:**

```
tests/
├── unit/
│   ├── embed-factory.test.js    # URL parsing and embed link synthesis
│   ├── store-videos.test.js     # State normalization and mutations
│   └── store-backend.test.js    # Atomic file persistence queue
└── e2e/
    └── grid-playback.test.js    # Multi-player layout rendering
```

## Test Structure

**Suite Organization (Prescribed Pattern):**

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { useVideosStore } from '@/stores/videos.js';
import { setActivePinia, createPinia } from 'pinia';

describe('Videos Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('normalizes valid YouTube watch URL into video model', () => {
    const store = useVideosStore();
    store.addVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(store.videos.length).toBeGreaterThan(0);
    expect(store.videos[0].type).toBe('youtube');
    expect(store.videos[0].sourceId).toBe('dQw4w9WgXcQ');
  });

  it('clamps screen count between 1 and 60', () => {
    const store = useVideosStore();
    store.setScreenCount(100);
    expect(store.screenCount).toBe(60);
    store.setScreenCount(0);
    expect(store.screenCount).toBe(1);
  });
});
```

**Patterns:**

- **Setup:** Clear `localStorage` before each test suite to avoid state leaking between tests.
- **Teardown:** Stop timers and close any mocked audio contexts or wake locks.
- **Assertion:** Strict equality on normalized source IDs and array lengths.

## Mocking

**Framework:**

- `vi` (when using Vitest) or custom stubs for browser APIs.

**Patterns:**

```javascript
// Mocking Web Audio Context & Navigator Wake Lock
global.AudioContext = class {
  createOscillator() { return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
  createGain() { return { gain: { value: 0 }, connect() {} }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
};

Object.defineProperty(navigator, 'wakeLock', {
  value: {
    request: () => Promise.resolve({ release: () => Promise.resolve() }),
  },
  configurable: true,
});
```

**What to Mock:**

- Browser APIs unsupported in headless Node environments (`navigator.wakeLock`, `window.AudioContext`, `navigator.clipboard`).
- External network requests (`fetch('/api/state')` and Upstash REST API).
- Cross-origin iframe rendering internals.

**What NOT to Mock:**

- URL parsing logic in `src/composables/useEmbedFactory.js` (test against real URL strings).
- Pinia store reactivity and computed properties.
- State serialization/deserialization logic (`normalizeSource`, `normalizeVideo`).

## Fixtures and Factories

**Test Data (Prescribed Samples):**

```javascript
export const SAMPLE_URLS = {
  youtubeWatch: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  youtubeShort: 'https://youtu.be/dQw4w9WgXcQ',
  youtubeLive:  'https://www.youtube.com/live/dQw4w9WgXcQ',
  twitchChannel: 'https://www.twitch.tv/ninja',
  twitchVod:     'https://www.twitch.tv/videos/1234567890',
  kickChannel:   'https://kick.com/xqc',
};
```

**Location:**

- Recommended: `tests/fixtures/sample-urls.js`.

## Coverage

**Requirements:**

- None enforced currently.
- Recommended target: 80%+ coverage for core business logic:
  - `src/composables/useEmbedFactory.js`
  - `src/stores/videos.js`
  - `server/store.js`

**View Coverage:**

```bash
npm run test:coverage
```

## Test Types

**Unit Tests:**

- Focus: URL parsing, regular expressions, ID extraction, boundary clamping, and atomic store state transitions.
- Key targets: `useEmbedFactory.js`, `videos.js`, `useRotation.js`.

**Integration Tests:**

- Focus: Cloud synchronization lifecycle between `useCloudSync.js` and `server/index.js` or `api/state.js`.
- Key targets: State push, state adoption, conflict prevention.

**E2E Tests:**

- Focus: Multi-iframe grid rendering, responsive layout shifts, and drag-and-drop reordering.
- Framework: Playwright or Cypress (not yet introduced).

## Common Patterns

**Async Testing:**

```javascript
it('debounces cloud sync push', async () => {
  vi.useFakeTimers();
  const pushSpy = vi.fn();
  // trigger change
  vi.advanceTimersByTime(1500);
  expect(pushSpy).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
```

**Error Testing:**

```javascript
it('rejects unsupported URLs gracefully', () => {
  const result = parseVideoUrl('https://example.com/not-a-video');
  expect(result).toBeNull();
});
```

---

*Testing analysis: 2026-11-18*
