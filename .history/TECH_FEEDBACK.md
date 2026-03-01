# QuizThat! — Technology Stack Review

**Reviewed by:** 3-agent expert panel (Frontend + Mobile, Pipeline + Python, DevOps + Audio)
**Documents reviewed:** TECH.md, SPEC.md (all sections), IDEA.md
**Date:** 2026-02-28
**Focus:** Gaps and risks — things that are missing, won't work as specified, or will cause problems during implementation.

---

## Summary & Consensus

### Top Strengths (agreed by all reviewers)

1. **Vue 3 + Pinia is an excellent fit for the serializable state machine.** Pinia stores are plain objects, making the SPEC's "persist full GameSession on every state transition" requirement straightforward. `$patch` for granular updates, `$subscribe` for auto-save hooks.
2. **Offline-first with no server dependency is the right call for V1.** Embedding the corpus as static assets avoids an entire class of connectivity/latency problems for a shared-device party game.
3. **Anthropic Python SDK with hand-rolled tool-use loop is a pragmatic choice.** Low abstraction, debuggable, small dependency surface. Appropriate for a defined workflow (research → construct → adapt → validate).
4. **GSAP for animations is well-chosen.** The SPEC requires timeline-based, sequenced animations (peg roulette, card reveals, confetti). GSAP's timeline API is purpose-built for this, with excellent mobile performance on GPU-composited properties.
5. **Question-as-folder data format is excellent.** Self-contained, inspectable, debuggable, independently validatable. Clean separation between pipeline output and game consumption.

### Top Gaps (consensus across reviewers, ranked by severity)

| # | Gap | Severity | Reviewers |
|---|-----|----------|-----------|
| 1 | Corpus audio bundle size (~430 MB for 1K questions) exceeds Android APK limit (150 MB) | **Critical** | Frontend, DevOps |
| 2 | SPEC says "Claude Code SDK" but TECH uses Anthropic Python SDK — document mismatch | **Critical** | Pipeline, DevOps |
| 3 | Howler.js needs a custom audio sequencer for sequential narration with skip/fade | **Significant** | Frontend, DevOps |
| 4 | Android WebView audio reliability issues (autoplay, context suspension, OEM quirks) | **Significant** | Frontend, DevOps |
| 5 | Vite prebuild with 12,000+ files will cause DX degradation and leak generation artifacts | **Significant** | Frontend, DevOps |
| 6 | No seedable PRNG library, but SPEC requires `rng_seed` for deterministic replay | **Significant** | Frontend, DevOps |
| 7 | Batch concurrency architecture unspecified (API rate limits, async vs. threading) | **Significant** | Pipeline |
| 8 | Agentic loop code example has correctness issues (system prompt, tool format, no retries) | **Significant** | Pipeline |
| 9 | rich-click alone cannot produce the SPEC's live terminal UI (needs `rich` directly) | **Significant** | Pipeline |
| 10 | No map library for Map Location question type (a V1 question type per SPEC) | **Significant** | Frontend |

### Reviewer Disagreements

- **Vue Router**: The frontend reviewer argues strongly to drop it (the state machine should drive screens, not a router). The other reviewers did not address this, but the argument is compelling for a single-flow game with no URL-addressable routes.
- **ffmpeg loudness target**: The DevOps reviewer argues -16 LUFS is too quiet for a party game on tablet speakers and recommends -14 or -12 LUFS. The pipeline reviewer did not address the specific target.
- **ElevenLabs SDK vs. raw httpx**: The pipeline reviewer recommends using the official `elevenlabs` Python SDK instead of raw `httpx`. The TECH chose httpx without stated rationale.

---

## Review 1: Frontend + Mobile Engineering

### Strengths

- Vue 3 Composition API + Pinia maps cleanly to the SPEC's serializable state machine and auto-save requirements.
- TypeScript strict mode will prevent entire categories of bugs in the 16-state machine, polymorphic `answer_data`, and deeply nested session model.
- GSAP + Howler.js are individually well-chosen for their respective domains.
- idb (~1KB) is appropriately minimal for the persistence requirement.

### Gaps & Risks

#### 1. Corpus bundle size exceeds Android APK limits (Critical)

Each question has 12 audio files (teaser + question + 4 answers × 2 languages). At 64 kbps MP3, ~40 KB per file. For 1,000 questions: ~470 MB of audio. Google Play's APK limit is 150 MB. Even with AAB, Capacitor has no built-in Play Asset Delivery support.

**Suggestion:** Decouple corpus from the Vite build. Serve audio separately (CDN for browser, Play Asset Delivery for Android). Lazy-load audio at question level, not teaser level.

#### 2. Howler.js in Capacitor WebView has known reliability issues (Critical)

Android WebView's Web Audio API has bugs: audio context suspension on backgrounding, autoplay inconsistencies, limited concurrent streams (1-2 on some OEMs). The SPEC requires sequential narration chains, skip with fade, heartbeat SFX overlaid on narration, and volume control.

**Suggestion:** Add `@capacitor-community/native-audio` for the Capacitor build. Abstract audio behind a service layer so browser uses Howler.js, Capacitor uses the native plugin.

#### 3. IndexedDB auto-save needs throttling (Significant)

Some state transitions fire in rapid succession (multi-peg placement = 6 transitions in seconds). Full `GameSession` serialization on every transition gets expensive as `TurnHistory` grows.

**Suggestion:** In-memory `structuredClone` on every transition + debounced IndexedDB write (500ms trailing, immediate flush on `visibilitychange`).

#### 4. Vue Router is unnecessary and creates dual navigation authority (Significant)

The game has no deep links, no URL-addressable routes, no back-button semantics. The state machine should be the single source of truth for screen visibility. Vue Router creates a competing navigation authority with desync risk.

**Suggestion:** Drop `vue-router`. Use `<component :is="screenForState(session.state)">` driven by the Pinia store.

#### 5. Tailwind CSS will fight custom game UI (Significant)

Tailwind is excellent for the app shell (setup, settings, menus) but awkward for: the bingo board (CSS Grid with dynamic sizing, peg animations), joker tray (15+ utility classes per icon state), GSAP animations (inline style conflicts with utility classes), and Map Location (fully custom canvas/SVG).

**Suggestion:** Keep Tailwind for app shell. Acknowledge that game board, joker tray, and special question types will use scoped component CSS.

#### 6. No map library for Map Location question type (Significant)

SPEC Section 5.5 includes Map Location as a V1 question type requiring: tile-based map renderer, pinch-to-zoom, crosshair overlay, accuracy radius, and offline tile availability.

**Suggestion:** Add Leaflet or MapLibre GL JS. Bundle a pre-generated tile set (world zoom 2-6, ~50 MB). Or defer Map Location to post-V1 and update the SPEC.

#### 7. No seedable PRNG library (Significant)

`rng_seed` in the session model implies deterministic replay. `Math.random()` is not seedable. Every random decision must use the seeded PRNG from day one — retrofitting is painful.

**Suggestion:** Add `seedrandom` (~2 KB) or hand-roll xoshiro256. Integrate as `session.rng.next()`.

#### 8. No drag-and-drop library for Sorting questions (Significant)

HTML5 drag-and-drop does not work on mobile. The SPEC allows "tap-to-swap as an alternative."

**Suggestion:** Either add SortableJS (via `@vueuse/integrations`) or implement sorting as tap-to-swap only for V1.

#### 9. Minor items

- **Custom numeric keypad** for Calculation questions not mentioned as a component.
- **Screen wake lock** needs explicit integration (Web API + `@capacitor-community/keep-awake`).
- **Touch/gesture strategy** not defined (pinch-to-zoom, swipe dismiss).
- **PWA service worker** deferred but needed for true offline on browser. Use `vite-plugin-pwa` from the start.
- **Cross-session data** (seen questions, settings) needs its own IndexedDB schema.

---

## Review 2: Pipeline + Python Engineering

### Strengths

- Clean separation between game application and generation pipeline, sharing only the question folder data format.
- Anthropic tool-use with a hand-rolled loop keeps abstractions low and code debuggable.
- Pydantic v2 discriminated unions handle the polymorphic `answer_data` cleanly.
- uv is a pragmatic modern choice for a developer-facing CLI tool.

### Gaps & Risks

#### 1. SPEC says Claude Code SDK; TECH says Anthropic Python SDK (Critical)

The SPEC (Section 2) explicitly states the pipeline is "built on the Claude Code SDK." The TECH implements a raw `anthropic.Anthropic()` tool-use loop. These are architecturally different products. Either the SPEC or the TECH must be updated.

**Suggestion:** Decide which approach to use. If Anthropic Python SDK (as TECH specifies), update the SPEC. The raw SDK approach is valid and gives more control, but the SPEC reference is misleading.

#### 2. Agentic loop code has correctness issues (Significant)

- **System prompt placement:** Code puts system prompt in the user message. The SDK has a dedicated `system` parameter.
- **`max_tokens=4096` may be insufficient** for full bilingual question generation with research.
- **No retry/error handling** for rate limits (429), overloaded (529), or malformed tool inputs.
- **No context window management** for long conversations with web search results.
- **`web_search_20250305` tool definition format** may be incorrect — server-side tools use a different schema than custom tools and may not accept `name` overrides.

#### 3. rich-click is insufficient for live terminal UI (Significant)

The SPEC describes spinners updating in-place, stages transitioning to checkmarks, progress bars with live counters. `rich-click` only provides Rich-formatted help text and errors. The actual live UI requires `rich.live.Live`, `rich.progress.Progress`, and `rich.console.Console` from `rich` directly.

**Suggestion:** Add `rich` as a direct dependency. Use `rich-click` for argument parsing, `rich` for all live terminal output.

#### 4. httpx for ElevenLabs is underspecified (Significant)

- Needs streaming responses (`httpx.stream()`) to avoid buffering entire audio in memory.
- No retry logic for the 12+ TTS calls per question.
- No rate limit handling for batch generation (600+ TTS calls for 50 questions).
- The official `elevenlabs` Python SDK provides all of this out of the box.

**Suggestion:** Evaluate using the `elevenlabs` SDK instead of raw `httpx`.

#### 5. Batch concurrency architecture is unspecified (Significant)

The SPEC says `generate-batch` supports configurable concurrent workers. No concurrency library, rate limiter, or async/threading strategy is specified.

**Suggestion:** Choose async (natural for I/O-bound API calls). Implement shared rate limiters for both Anthropic and ElevenLabs APIs. Address filesystem concurrency for corpus writes.

#### 6. Missing tools in the agentic loop (Significant)

The TECH defines only 2 tools: `web_search` and `write_question`. The SPEC workflow also requires:
- `check_corpus` / `list_existing_topics` for duplicate awareness
- Writing `generation/research.md`, `generation/prompt.md`, `generation/log.json`

The `write_question` tool schema does not include audit trail files.

#### 7. Polymorphic `answer_data` needs cross-file validation (Minor)

The question type is in `meta.json` but `answer_data` is in `question.{lang}.json`. Pydantic cannot validate `answer_data` without first reading `meta.json`. Validation must happen at the folder level.

#### 8. `--validate` doubles API cost (Minor)

Every validated question incurs two full API round-trips. For 50-question batches, that is 100+ API calls. Consider: validate within the same conversation first (structured confidence score), then run separate validation only for low-confidence outputs.

#### 9. Minor items

- **Corpus scanning** (`stats`, `gaps`, `validate`) needs caching for large corpora (SQLite or cached JSON index).
- **`categories.yaml` sync** between pipeline and frontend i18n is not addressed.
- **No token counting or cost tracking** — a 50-question batch can cost $20-50+.
- **ffmpeg is a system dependency** not containerized or documented.
- **`quizthat` package distribution** (how end users install and run the CLI) is not specified.

---

## Review 3: DevOps + Audio Engineering

### Strengths

- ElevenLabs + ffmpeg pipeline is practical; native MP3 output avoids transcoding.
- Voice configuration in `voices.yaml` with tunable parameters supports quality iteration without code changes.
- Pinia + IndexedDB auto-save is a clean separation of runtime state and persistence.

### Gaps & Risks

#### 1. Corpus bundle size exceeds Android APK limits (Critical)

Detailed estimate: 1,000 questions × 2 languages × 6 audio files × ~36 KB = **~432 MB**. Google Play base APK limit is 150 MB. Capacitor has no built-in Play Asset Delivery support. Even 500 questions (~215 MB) exceeds the limit.

**Options:** Downloadable corpus packs, Play Asset Delivery with custom plugin, lower bitrate (48/32 kbps), Opus/WebM with MP3 fallback, smaller base corpus with expansion downloads.

#### 2. Vite prebuild with 12,000+ files causes DX and build problems (Significant)

- File copy overhead on every build (18,000+ files including generation artifacts).
- Vite dev server file-watcher exhaustion (Linux `inotify` default limit is 8,192).
- Generation artifacts (`research.md`, `prompt.md`, `log.json`) leak into production unless explicitly filtered.

**Suggestion:** Prebuild script must: (a) copy only runtime files (meta.json, question.*.json, audio/*.mp3); (b) exclude generation artifacts; (c) use symlinks in dev. Consider serving corpus from a separate directory during development.

#### 3. Custom audio sequencer needed on top of Howler.js (Significant)

Howler.js provides `play()`, `stop()`, `fade()`, `on('end')`. It does NOT provide: sequential playback queue, automatic chaining with pauses, or "skip current queue" with fade. The SPEC requires all of these.

**Suggestion:** Design a dedicated audio sequencer module: playlist input, sequential playback with inter-file pauses, interruptible with 200ms fade, preload-ahead, unload-behind, Android WebView context lifecycle management.

#### 4. Android WebView audio autoplay restrictions (Significant)

Audio context requires user gesture unlock. Howler.js `autoUnlock` helps but is unreliable in Capacitor WebViews (varies by Android version and OEM). Audio context can re-suspend on background/foreground transitions.

**Suggestion:** Audio manager service that: (a) unlocks context on first gesture and re-unlocks on `visibilitychange`; (b) limits concurrent Howl instances; (c) handles Capacitor lifecycle. Consider `@capacitor-community/native-audio` as fallback.

#### 5. ffmpeg loudness normalization is problematic for short clips (Significant)

- EBU R128 `loudnorm` needs 400ms measurement windows; 2-second answer clips produce unreliable results.
- -16 LUFS may be too quiet for a party game on tablet speakers in a noisy room.
- Single-pass `loudnorm` can introduce audible pumping on short clips.
- LRA=11 is too permissive for speech (typical speech LRA: 5-8 dB).

**Suggestion:** Use dual-pass normalization. Consider -14 or -12 LUFS. For clips under 3s, use simple peak/RMS normalization. Test with actual ElevenLabs output on actual tablet speakers.

#### 6. Docker Compose is incomplete (Significant)

- No volume mount for `questions/` corpus directory.
- No pipeline service (ffmpeg not containerized).
- No `.env` or secret management for API keys.
- Production Nginx config missing (SPA fallback, cache headers, compression).
- Anonymous `node_modules` volume behavior not documented.

#### 7. No CI/CD pipeline (Significant)

No automated: linting, type-checking, test runs, build verification, corpus validation, APK size checks, or audio normalization verification. Without CI, bundle size regressions (the critical risk) go undetected.

#### 8. Pre-generated UI voice lines have no management strategy (Minor)

~60-80 app-level voice lines (turn transitions, reactions, victory, joker activations) are distinct from per-question audio. No generation workflow, storage location, or bundling strategy is defined.

#### 9. No audio memory management strategy (Minor)

12,000 MP3 files in the corpus. Loading without unloading grows memory unbounded. On mobile WebViews, this triggers OOM. Need question-scoped audio lifecycle: load on question display, unload on turn end.

#### 10. Minor items

- **No cache-busting** for corpus files in `public/` (no content hashes).
- **Capacitor plugin list** not specified (filesystem, wake lock, native audio).
- **GSAP + Howler.js sync** for audio-visual coordination (peg roulette tick sounds) is unaddressed. Android WebView audio latency is 50-150ms.
- **Board viewer audio interaction** not specified (should narration continue when overlay opens?).
- **Heartbeat SFX** with increasing tempo needs implementation strategy (playback rate manipulation or interval-based clips).

---

## Cross-Reference: SPEC Requirements vs. TECH Gaps

| SPEC Requirement | Section | Status in TECH | Action Needed |
|---|---|---|---|
| Claude Code SDK as agent backend | 2 | **Mismatch** — TECH uses Anthropic Python SDK | Resolve: update SPEC or TECH |
| Map Location with zoomable map, offline tiles | 5.5 | **Missing** | Add map library or defer to post-V1 |
| Sorting with drag-and-drop | 5.5 | **Missing** | Add SortableJS or use tap-to-swap |
| Custom numeric keypad for Calculation | 5.5 | **Missing** | Document as custom component |
| Sequential narration with skip/fade | 6 | **Insufficient** | Design audio sequencer module |
| Pre-generated UI voice lines | 6 | **Missing** | Define generation + bundling strategy |
| Deterministic replay via `rng_seed` | 9 | **Missing** | Add seedable PRNG library |
| Auto-save on every state transition | 9 | **Risky** | Add debounce/throttle strategy |
| Cross-session question depletion | 9 | **Implicit** | Define IndexedDB schema |
| Heartbeat SFX with increasing tempo | 5.5 | **Unaddressed** | Define implementation approach |
| Peg roulette with sound | 5.8 | **Partial** | Address GSAP + Howler.js sync |
| `generation/` audit trail files | 3 | **Incomplete** | Add tools + exclude from build |
| Live terminal progress UI | 2 | **Insufficient** | Add `rich` as direct dependency |
| Batch concurrency | 2 | **Missing** | Design async + rate limiting |
| Corpus bundle for Android | — | **Broken** | Redesign asset delivery strategy |

---

## Prioritized Recommendations

### Must resolve before implementation

1. **Resolve SPEC/TECH mismatch on agent backend.** Update whichever document is wrong (Claude Code SDK vs. Anthropic Python SDK).
2. **Design corpus asset delivery strategy.** The current plan of bundling everything in the APK does not work. Decide: smaller base corpus, download-on-first-launch, Play Asset Delivery, or dramatically lower bitrate.
3. **Add seedable PRNG to tech stack.** Cannot be retrofitted — every random call must use it from day one.
4. **Decide Map Location scope for V1.** If in V1, add a map library and offline tile strategy. If deferred, update the SPEC.

### Must resolve before building the relevant component

5. **Design the audio sequencer module.** Custom layer on top of Howler.js for sequential playback, queueing, interruption, and memory management.
6. **Drop Vue Router.** Drive screens from the state machine via Pinia store. Eliminates navigation desync bugs.
7. **Add `rich` as direct pipeline dependency.** `rich-click` cannot produce the SPEC's live terminal UI.
8. **Fix the agentic loop code example.** Correct system prompt placement, tool definition format, add error handling.
9. **Expand agentic loop tool set.** Add corpus check, research notes, and audit trail tools.
10. **Add drag-and-drop or tap-to-swap for Sorting.** Either SortableJS or tap-only interaction.

### Should address in planning / early development

11. **Evaluate `elevenlabs` SDK vs. raw `httpx`.**
12. **Design debounced auto-save strategy.**
13. **Plan ffmpeg normalization approach** (dual-pass, adjusted LUFS target, short-clip handling).
14. **Flesh out Docker Compose** (corpus volume, pipeline service, Nginx config, secrets).
15. **Acknowledge Tailwind limitations** for game-specific UI; plan scoped CSS for board/joker/animation components.
16. **Define pre-generated UI voice line workflow** (generation, storage, bundling).
17. **Plan Capacitor plugin requirements** (native audio, wake lock, filesystem).
18. **Add CI/CD** with build verification and APK size budgeting.

### Can defer to later

19. **PWA service worker** — add `vite-plugin-pwa` when the app is functional.
20. **Cache-busting for corpus files** — version the corpus path.
