# Tech Stack — Open Questions

The TECH.md covers the major choices, but several items are explicitly marked TBD or have multiple options listed without a decision. These need to be resolved before scaffolding the project.

---

## Frontend

### 1. Which CSS/styling approach should we use?

TECH.md lists this as TBD. This affects every component you write, so it's worth deciding upfront.

- A) Tailwind CSS (recommended) — utility-first, fast prototyping, great with Vue, no CSS file sprawl. Large community, well-documented.
- B) UnoCSS — similar utility-first approach but more configurable and lighter. Less mainstream but works well with Vite.
- C) CSS Modules — scoped CSS per component, no framework dependency. More manual but zero magic.
- D) Plain scoped `<style>` in SFCs — simplest, no extra dependency. Fine for smaller projects, gets messy at scale.

> A

---

### 2. Which audio playback library should we use?

TECH.md says "Howler.js or Web Audio API directly". The game plays voice lines, handles skip/fade-out, and plays sound effects — audio is a core feature, not an afterthought.

- A) Howler.js (recommended) — mature, handles Web Audio with HTML5 Audio fallback, sprite support, volume control, fade API built in. Well-tested on mobile browsers.
- B) Web Audio API directly — no dependency, maximum control. But you'd need to build fade-out, volume management, format fallback, and mobile quirk handling yourself.
- C) Tone.js — powerful but overkill (designed for music synthesis, not speech playback)

> A 

---

### 3. Which IndexedDB wrapper should we use for auto-save?

The game auto-saves after every state transition. The wrapper needs to be lightweight and reliable, not a full ORM.

- A) `idb` by Jake Archibald (recommended) — thin Promise wrapper around IndexedDB, ~1KB, widely used, maintained
- B) Dexie.js — more features (queries, transactions, live queries), ~15KB. Useful if you later want to query match history.
- C) localForage — simpler API (localStorage-like), falls back to WebSQL/localStorage. Less control over IndexedDB specifics.

> A

---

### 4. Do we need an animation library for game animations?

The SPEC describes several animations: peg placement roulette, card reveals, confetti on victory, board transitions. These could be done with CSS transitions/animations alone, or with a library.

- A) CSS transitions + a lightweight library for complex sequences (e.g. `@vueuse/motion` or Vue's built-in `<Transition>`) — keeps it simple, use a library only for confetti or particle effects
- B) GSAP (GreenSock) — industry standard for complex web animations, timeline-based, performant. More powerful but adds ~30KB.
- C) Lottie (via `lottie-web`) — for pre-designed animations exported from After Effects. Great for polished effects, but requires creating the animation assets separately.
- D) Pure CSS only — no library at all. Simpler but harder to orchestrate multi-step sequences (e.g. the peg roulette).

> B

---

## Pipeline

### 5. How should the Python CLI invoke the Claude Code SDK?

TECH.md lists two options without deciding. The Claude Code SDK is TypeScript, but the CLI is Python. They need to talk to each other.

- A) Subprocess — Python calls `claude` CLI as a subprocess, parses stdout. Simplest, no Node.js bridge to maintain. Less structured output.
- B) Node.js bridge over stdio — Python spawns a small Node.js script that uses the SDK, communicates via JSON over stdin/stdout. More structured but adds a maintenance surface.
- C) Use the Anthropic Python SDK directly instead of Claude Code SDK — skip the TypeScript SDK entirely, call the Claude API from Python with tool-use. Full control, no cross-language bridge. But you lose Claude Code's built-in tool orchestration (web search, file write).
- D) Decide later — this doesn't block frontend work, can be deferred.

> C) you can research how this works concretely

---

### 6. Should `uv` be the Python package manager?

TECH.md says "uv (or pip)". `uv` is fast and modern but relatively new.

- A) uv (recommended) — extremely fast installs, lockfile support, drop-in pip replacement. Increasingly the default in the Python ecosystem.
- B) pip + pip-tools — battle-tested, no new tooling to learn. Slower but universally supported.
- C) Poetry — full project management (deps, builds, publishing). More opinionated but popular for CLI tools.

> A

---

## Testing & Quality

### 7. What testing setup should we use?

TECH.md doesn't mention testing at all. The game engine (state machine, algorithms) is complex enough that tests are essential.

- A) Vitest (frontend) + pytest (pipeline) (recommended) — Vitest is Vite-native, fast, Jest-compatible API. pytest is the Python standard. Covers both halves of the project.
- B) Vitest + Playwright (frontend E2E) + pytest — adds end-to-end browser testing for screen flows. More comprehensive but heavier setup.
- C) Jest (frontend) + pytest (pipeline) — Jest works but doesn't integrate as tightly with Vite. No strong reason to prefer it over Vitest.

> A

---

### 8. What linting/formatting tools should we use?

Consistency tooling to set up once and forget.

- A) ESLint + Prettier (frontend) + Ruff (pipeline) (recommended) — ESLint for code quality, Prettier for formatting (no debates), Ruff for Python (fast, replaces flake8+black+isort). Standard choices.
- B) Biome (frontend) + Ruff (pipeline) — Biome replaces both ESLint and Prettier in one tool. Faster, fewer config files. Newer, smaller ecosystem.
- C) Minimal — just editor settings (`.editorconfig`) and no linters. Move fast, clean up later.

> C

---

## Deployment & Infrastructure

### 9. Should iOS be an explicit target alongside Android?

TECH.md only mentions Android via Capacitor. Capacitor supports iOS equally well — same codebase, just a different build target. But iOS requires a Mac for building, an Apple Developer account ($99/year), and App Store review.

- A) Android only for V1 — simpler, no Apple ecosystem dependency. Add iOS later if there's demand.
- B) Android + iOS from the start — Capacitor supports both, the code is identical. Only the build/publish pipeline differs.
- C) Neither for V1 — focus purely on the browser/PWA experience. Add native apps later.

> A

---

### 10. How should the question corpus get into the frontend build?

The pipeline writes questions to `questions/` at the repo root. The frontend expects them in `public/corpus/`. The build needs to bridge this gap and generate the `corpus-index.json`.

- A) Vite plugin / build script — a custom Vite plugin or `prebuild` npm script that copies `questions/` into `public/corpus/` and generates `corpus-index.json` by scanning all `meta.json` files. Runs automatically on `npm run build`.
- B) Pipeline responsibility — the `quizthat corpus build-index` command generates both the index and copies files into the frontend's public directory. Requires running a pipeline command before building the frontend.
- C) Symlink — `public/corpus` symlinks to `questions/`. Simple in dev, but breaks in Docker and Capacitor builds.

> A

---
