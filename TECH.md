# QuizThat! — Technology Stack

This document defines the technology choices for building QuizThat!. It covers the game application, the question generation pipeline, and the development/deployment infrastructure.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Game Application                      │
│                                                         │
│   Vue 3 (Composition API) + Pinia + TypeScript          │
│   ┌───────────────┐  ┌──────────────┐  ┌────────────┐  │
│   │  Game Engine   │  │  UI / Views  │  │   Audio    │  │
│   │  (state machine│  │  (screens,   │  │  (Howler.js│  │
│   │   + session)   │  │   components)│  │   + GSAP)  │  │
│   └───────────────┘  └──────────────┘  └────────────┘  │
│                         │                               │
│              ┌──────────┴──────────┐                    │
│              │  Corpus (embedded)  │                    │
│              │  questions + audio  │                    │
│              └─────────────────────┘                    │
├─────────────────────────────────────────────────────────┤
│  Deployment: Browser (Vite/SPA) │ Android (Capacitor)   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               Question Generation Pipeline               │
│                                                         │
│   Python CLI (rich-click)                               │
│   ┌───────────────┐  ┌──────────────┐  ┌────────────┐  │
│   │  Agent Runner  │  │  TTS Engine  │  │  Corpus    │  │
│   │  (Claude Agent │  │  (ElevenLabs │  │  Manager   │  │
│   │   SDK)         │  │   SDK)       │  │            │  │
│   └───────────────┘  └──────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Game Application

### Framework

| Layer | Choice | Rationale |
|-------|--------|-----------|
| UI framework | **Vue 3** (Composition API, `<script setup>`) | Reactive, lightweight, excellent TypeScript support |
| State management | **Pinia** | Official Vue store, clean composable API, serializable state (critical for auto-save) |
| Language | **TypeScript** (strict mode) | Type safety for the state machine, session model, and question schemas |
| Build tool | **Vite** | Fast dev server, optimized production builds, native Vue support |
| Styling | **Tailwind CSS** | Utility-first, fast prototyping, great Vue integration, no CSS file sprawl |
| Animation | **GSAP** (GreenSock) | Timeline-based animation engine for complex sequences (peg roulette, card reveals, confetti) |
| Audio | **Howler.js** | Mature audio library with Web Audio + HTML5 Audio fallback, built-in fade/volume, mobile-tested. Handles voice lines, sound effects, and background music loop with ducking. |
| Drag-and-drop | **SortableJS** | Touch-friendly drag-and-drop for Sorting question type. Works on mobile/WebView without HTML5 DnD API. Tap-to-swap fallback for accessibility. |
| Maps | **Leaflet** | Lightweight map library for Map Location question type. Bundled tile set for offline support. Touch-friendly pan/zoom. |
| Randomness | **seedrandom** | Seedable PRNG (~2KB). Required by the session model's `rng_seed` for deterministic replay. Every random decision in the game engine must use the seeded PRNG, never `Math.random()` |
| Persistence | **idb** | Thin IndexedDB Promise wrapper (~1KB) for auto-save/resume |

### Offline-First Design

The game is a **frontend-only application** with no server dependency at runtime.
That remains true for shared-tablet play; the multi-device mode described under
"Server Extension" below adds an optional backend rather than replacing it.

- **Game state**: Stored in the browser via IndexedDB (using `idb`). Pinia stores are the runtime representation; IndexedDB is the persistence layer for auto-save/resume. Auto-save uses a **debounced write strategy**: every state transition triggers a synchronous in-memory snapshot (`structuredClone`), but the actual IndexedDB write is debounced (500ms trailing). An immediate flush is triggered on `visibilitychange` / `pagehide` to catch app backgrounding. This avoids I/O thrashing during rapid transitions (e.g., multi-peg placement) while preserving the "never lose more than one transition" guarantee.
- **Question corpus**: Served as **static files separate from the Vite build**. The corpus is never part of the `dist/` bundle. Instead, it is served alongside the app from a dedicated path. A build script generates `corpus-index.json` by scanning all `meta.json` files. The game loads the index at startup and lazy-loads individual question JSON and audio files on demand via HTTP fetch. See "Corpus Serving Strategy" below for per-target details.
- **No network required for Android**: Once the app is installed, gameplay works fully offline (corpus is bundled as app assets). The browser version requires the server to be reachable for corpus files.

### Server Extension

The architecture allowed for a server connection without restructuring, and that is
what happened — the store really was the seam it was expected to be:

- Pinia stores are the single source of truth for game state. A future sync layer would subscribe to store mutations and push them to a server.
- Match history and statistics are already tracked in the session data model (`TurnHistory`, `PlayerStats`). A server sync would upload completed `GameSession` objects after a game ends.
- The corpus could be updated over the network (download new question packs) without changing the runtime loading logic — the index format and lazy-loading remain the same.
- **Built.** See `backend/`, and IMPL.md §16. The shape chosen is narrower than
  "sync": a **thin relay**. Django + DRF owns lobbies, an intent inbox and SSE
  fan-out; it stores the serialized `GameSession` as an opaque blob and never parses
  it. One client stays authoritative and runs the engine, so the rules exist once,
  in TypeScript. What this section did not anticipate is the *realtime,
  device-to-device* part — it framed the server as upload-after-the-fact.
- Offline shared-tablet play is unaffected and requires no server.

### Deployment Targets

#### Browser (Primary)

- Built as a standard **Vite SPA** (single-page application).
- The app bundle (`dist/`) contains only the Vue app, JS, CSS, and UI assets (icons, UI sounds). No corpus files.
- In production, **Nginx** serves both the app (`dist/`) and the corpus (`questions/`) from **separate paths** on the same server. The corpus is served as-is from the `questions/` directory — no build step copies or transforms it.
- Works in all modern browsers (Chrome, Firefox, Safari, Edge).
- Can be installed as a **PWA** (Progressive Web App) for offline access and home screen icon — requires a service worker and manifest, added when the app is stable.

#### Android (Secondary)

- Packaged as a native Android app using **Capacitor** (by the Ionic team).
- Capacitor wraps the same Vue SPA in a native WebView and provides access to native APIs (filesystem, audio, screen wake lock) via plugins.
- The **full question corpus is bundled as app assets** in the APK/AAB. Play Store size limits (Play Asset Delivery, etc.) will be addressed when publishing — for V1 development, the corpus ships as-is.
- Published to the Google Play Store as an AAB (Android App Bundle).

**V1 scope: Android only.** iOS requires a Mac for building and an Apple Developer account ($99/year). iOS support can be added later — the codebase is identical, only the build/publish pipeline differs.

**Why Capacitor over Electron:** Electron targets desktop (Windows/Mac/Linux), which is not the primary use case for a shared-device party game on tablets. Capacitor targets mobile (Android/iOS) natively. If a desktop version is desired later, Electron or Tauri can wrap the same SPA with minimal changes.

### Corpus Serving Strategy

The question corpus (`questions/` directory) is **never part of the Vite build**. It is served separately depending on the deployment target:

#### How it works

1. A **build script** (`scripts/build-corpus-index`) scans all `questions/*/meta.json` files and generates `corpus-index.json`. This index contains question IDs, categories, difficulties, supported languages, and file paths. It excludes `generation/` audit trail files.
2. The game app loads `corpus-index.json` at startup, filters it by language, and lazy-loads individual question JSON and audio files on demand via relative HTTP fetch.
3. The **base URL** for corpus files is configured per deployment target:

| Target | Corpus base URL | How corpus is served |
|--------|----------------|---------------------|
| **Dev** (docker-compose) | `http://localhost:8080/` | Separate Nginx container serving `questions/` directly |
| **Production browser** | `/corpus/` | Nginx serves `questions/` at `/corpus/` path (separate from `dist/`) |
| **Capacitor Android** | Bundled as app assets | Loaded from local filesystem via Capacitor |

#### Dev environment

In development, the corpus is served by a **separate Nginx container** (not the Vite dev server). This keeps the Vite dev server fast (no file-watcher overhead from thousands of corpus files) and mirrors the production architecture:

```yaml
services:
  frontend:
    # Vite dev server — only serves the Vue app
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0

  corpus:
    # Separate static server for the question corpus
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./questions:/usr/share/nginx/html:ro
```

#### Production browser

Nginx serves the app and corpus from the same server on different paths:

```nginx
server {
    listen 80;

    # Vue SPA
    location / {
        root /app/dist;
        try_files $uri $uri/ /index.html;
    }

    # Question corpus (served directly from questions/ directory)
    location /corpus/ {
        alias /app/questions/;
        # Exclude generation audit trails from being served
        location ~* /generation/ {
            return 404;
        }
        # Long cache — corpus files are immutable once generated
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

#### Capacitor Android

For the Android build, the corpus is copied into Capacitor's asset directory as a build step. The app loads files from the local filesystem instead of HTTP. The corpus base URL is detected at runtime based on whether the app is running in a browser or Capacitor.

---

## Question Generation Pipeline

### CLI

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | **Python 3.12+** | Rich ecosystem for API clients, file processing, and CLI tooling |
| CLI framework | **rich-click** + **rich** | `rich-click` for Click-based argument parsing with rich help/errors. `rich` directly for all live terminal output: `rich.live.Live` for multi-stage spinner displays, `rich.progress.Progress` for batch progress bars, `rich.status.Status` for single-stage spinners. |
| Package manager | **uv** | Fast dependency resolution, lockfile support |

The CLI exposes the commands defined in the SPEC (`quizthat generate`, `quizthat generate-batch`, `quizthat corpus`).

### Agent Backend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| SDK | **Claude Agent SDK** (`claude-agent-sdk`) | Programmatic access to Claude Code as a full agentic system. Handles the agentic loop, tool execution, and conversation management. Built-in tools (WebSearch, Read, Write, Bash, etc.) available out of the box. Custom tools defined via `@tool` decorator as in-process MCP servers. |
| Model | **Claude Sonnet** (default for generation), configurable | Cost-effective for bulk generation; Opus available for validation passes |
| Web search | **Claude Code built-in WebSearch tool** | No separate search API needed — Claude Code has web search built in as a tool |

#### Agent Architecture

The pipeline uses the **Claude Agent SDK** (`pip install claude-agent-sdk`), which provides programmatic access to Claude Code. The SDK manages the full agentic loop internally — the Python code defines custom tools and consumes the message stream:

```python
import asyncio
from claude_agent_sdk import query, tool, create_sdk_mcp_server, ClaudeAgentOptions
from claude_agent_sdk.types import AssistantMessage, TextBlock, ResultMessage

# Define custom tools as in-process MCP tools
@tool("write_question", "Write a question folder to the corpus", {
    "question_id": str,
    "meta": dict,
    "question_en": dict,
    "question_de": dict,
    "research_notes": str,
})
async def write_question(args):
    # Write meta.json, question.en.json, question.de.json, generation/research.md
    question_id = args["question_id"]
    write_question_folder(question_id, args)
    return {"content": [{"type": "text", "text": f"Question written to questions/{question_id}/"}]}

@tool("check_corpus", "Check existing corpus for similar questions to avoid duplicates", {
    "category": str,
    "topic_summary": str,
})
async def check_corpus(args):
    existing = find_similar_questions(args["category"], args["topic_summary"])
    return {"content": [{"type": "text", "text": json.dumps(existing)}]}

# Bundle custom tools into an MCP server
pipeline_tools = create_sdk_mcp_server(
    name="pipeline",
    tools=[write_question, check_corpus],
)

async def generate_question(prompt: str, category: str, difficulty: str):
    options = ClaudeAgentOptions(
        system_prompt=GENERATION_SYSTEM_PROMPT,
        model="claude-sonnet-4-20250514",
        permission_mode="acceptEdits",
        allowed_tools=[
            "WebSearch",                          # Built-in Claude Code tool
            "mcp__pipeline__write_question",      # Custom tool
            "mcp__pipeline__check_corpus",        # Custom tool
        ],
        mcp_servers={"pipeline": pipeline_tools},
        max_turns=20,
    )

    result_text = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    result_text += block.text
        if isinstance(message, ResultMessage):
            break

    return result_text

asyncio.run(generate_question(user_prompt, category, difficulty))
```

**Key advantages of the Claude Agent SDK approach:**
- **No manual agentic loop.** The SDK handles the full conversation loop, tool dispatch, retries, and context management internally.
- **Built-in tools for free.** WebSearch, file read/write, bash execution, etc. are available without defining them. The agent can research topics via web search out of the box.
- **Custom tools via `@tool` decorator.** Pipeline-specific tools (write_question, check_corpus) are defined as Python async functions with type-safe schemas, bundled as an in-process MCP server.
- **Budget and turn limits.** `max_turns` and `max_budget_usd` prevent runaway agent loops.
- **Same Python process.** The SDK bundles the Claude Code CLI — no separate Node.js installation needed. Custom tool handlers execute in-process.
- **Configurable model.** The `model` parameter selects which Claude model to use (Sonnet for generation, Opus for validation).

### Voice Generation

| Component | Choice | Rationale |
|-----------|--------|-----------|
| TTS provider | **ElevenLabs** (via official `elevenlabs` Python SDK) | High-quality multilingual voices, per-character billing, MP3 output. The SDK provides streaming responses, built-in retry logic, and typed responses — avoids reimplementing these with raw HTTP. |
| Audio format | **MP3 64 kbps, 44.1 kHz, mono** | Universal compatibility, adequate for speech |
| Post-processing | **ffmpeg** (dual-pass loudness normalization to -14 LUFS) | Consistent volume across all voice lines. -14 LUFS is louder than broadcast standard (-16) for clarity on tablet speakers in noisy environments. Dual-pass avoids audible pumping. For clips under 3 seconds, simple peak normalization is used instead of EBU R128. |
| Configuration | `config/voices.yaml` | Voice IDs, model, generation parameters per language (see SPEC Section 2) |

### Pipeline Data Flow

```
quizthat generate "prompt" --category X --difficulty Y --languages en,de
  │
  ├─► Agent (Claude Agent SDK)
  │     ├─► Web search (Claude Code built-in WebSearch tool)
  │     ├─► Construct question (English first)
  │     ├─► Adapt to German (same conversation or second call)
  │     └─► Write question folder (via custom MCP write_question tool)
  │
  ├─► [--validate] Validation agent (separate API call, fresh context)
  │     └─► Verify correctness, flag if low confidence
  │
  └─► TTS (ElevenLabs)
        ├─► Generate teaser, question, per-option answer audio per language
        ├─► Normalize loudness (ffmpeg -af loudnorm)
        └─► Write audio files to question folder
```

---

## Development Environment

### Docker Compose

A `docker-compose.yml` provides a reproducible development environment with the corpus served separately:

```yaml
services:
  frontend:
    # Vite dev server — only serves the Vue app, no corpus
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0

  corpus:
    # Separate static server for the question corpus
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./questions:/usr/share/nginx/html:ro

  # Future: backend service would go here
```

For production, a single Nginx instance serves both the app and corpus (see Nginx config in "Corpus Serving Strategy" above).

### Project Structure

```
quiz_that/
  frontend/                  # Vue 3 application
    src/
      assets/                # Static assets (icons, sounds)
      components/            # Reusable UI components
      screens/               # Screen-level components (one per game state, rendered by App.vue via state machine)
      stores/                # Pinia stores (game session, settings, UI state)
      engine/                # Game logic (state machine, algorithms, win detection)
      audio/                 # Audio sequencer (sequential playback queue, skip/fade, preload/unload lifecycle)
      types/                 # TypeScript type definitions (session model, question schema)
      i18n/                  # Internationalization string files
      App.vue
      main.ts
    public/                  # Static assets served by Vite (UI only — no corpus)
    index.html
    vite.config.ts
    package.json
    Dockerfile

  pipeline/                  # Question generation CLI
    quizthat/                # Python package
      cli.py                 # CLI entry point (rich-click)
      generate.py            # Single question generation
      batch.py               # Batch generation
      corpus.py              # Corpus management commands
      agent/                 # Agent interface (Claude Agent SDK + custom MCP tools)
      tts/                   # ElevenLabs integration
      validation/            # Validation agent logic
    config/
      voices.yaml            # TTS voice configuration
      categories.yaml        # Category/subcategory taxonomy (shared source of truth)
    pyproject.toml

  questions/                 # Generated question corpus (output of pipeline, served separately)
    corpus-index.json        # Generated by build script — index of all questions
    {question-id}/
      meta.json
      question.en.json
      question.de.json
      audio/
      generation/            # Audit trail (not served in production)

  scripts/
    build-corpus-index       # Scans questions/*/meta.json → generates corpus-index.json

  docker-compose.yml
  SPEC.md
  IDEA.md
  TECH.md
```

### Testing

| Layer | Framework | Scope |
|-------|-----------|-------|
| Frontend unit/integration | **Vitest** + `@vue/test-utils` | Game engine (state machine, algorithms, win detection), Pinia stores, component logic |
| Pipeline | **pytest** | Agent tool execution, question schema validation, corpus management, CLI commands |

The game engine (`src/engine/`) is the most critical test target — the state machine, question selection algorithm, win detection, and peg placement logic should have thorough unit test coverage.

### Key Dependencies

**Frontend (npm):**
- `vue` 3.x — UI framework
- `pinia` — state management
- `vue-i18n` — internationalization
- `tailwindcss` — utility-first CSS framework
- `howler` — audio playback (voice lines, sound effects, background music loop with ducking, fade/volume control)
- `gsap` — animation engine (peg roulette, card reveals, confetti, board transitions)
- `sortablejs` — touch-friendly drag-and-drop (Sorting question type)
- `leaflet` — map rendering (Map Location question type, bundled tiles for offline)
- `seedrandom` — seedable PRNG for deterministic replay (~2KB)
- `idb` — IndexedDB wrapper for auto-save (~1KB)

**No Vue Router.** The game has no deep links, URL-addressable routes, or back-button semantics. The state machine (Pinia store) is the single source of truth for which screen is displayed. `App.vue` renders the current screen via `<component :is="screenForState(session.state)">`. This eliminates navigation/state desync bugs and simplifies auto-save/resume (restoring a saved session just means restoring the Pinia state — no route rehydration needed).

**Dev dependencies (npm):**
- `vitest` — unit/integration testing (Vite-native, Jest-compatible API)
- `@vue/test-utils` — Vue component testing

**Pipeline (Python):**
- `rich-click` — CLI framework (Click-based argument parsing with Rich-formatted help/errors)
- `rich` — live terminal UI (`rich.live.Live`, `rich.progress.Progress`, `rich.status.Status` for the multi-stage progress display). `rich-click` handles argument parsing; `rich` directly handles all live output (spinners, checkmarks, progress bars).
- `claude-agent-sdk` — Claude Agent SDK (programmatic access to Claude Code as an agentic system with built-in web search, file tools, and custom MCP tool support)
- `elevenlabs` — official ElevenLabs Python SDK (streaming TTS responses, built-in retry logic, typed responses). Preferred over raw `httpx` to avoid reimplementing streaming, retries, and rate limit handling.
- `pyyaml` — YAML config parsing
- `pydantic` — Data validation for question schemas
- `pytest` — testing

**Infrastructure:**
- `docker` + `docker-compose` — Development and production environments
- `nginx` — Production static file serving
- `ffmpeg` — Audio post-processing (loudness normalization)
