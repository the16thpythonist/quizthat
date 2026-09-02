# QuizThat! — Technical Specification

This document describes the concrete specifications for building QuizThat!. It covers both the **game application** (the player-facing app) and the **question generation pipeline** (the backend system that produces the question corpus). For the game design and rules, see [IDEA.md](./IDEA.md).

---

## Table of Contents

1. [Internationalization](#1-internationalization)
2. [Question Generation Pipeline](#2-question-generation-pipeline)
3. [Question Data Format](#3-question-data-format)
4. [Game Application](#4-game-application)
5. [Screen Flow & UI Specification](#5-screen-flow--ui-specification)
6. [Narrator / Voice System](#6-narrator--voice-system)
7. [Board Viewer](#7-board-viewer)
8. [Game State Machine](#8-game-state-machine)
9. [Game Session Data Model](#9-game-session-data-model)
10. [Question Selection Algorithm](#10-question-selection-algorithm)
11. [Starting Peg Algorithm](#11-starting-peg-algorithm)

---

## 1. Internationalization

The app must support **multiple languages from the start**. Initial supported languages:

- **English** (en)
- **German** (de)

### Scope

Internationalization applies to **all** layers of the system:

- **Game UI**: All labels, buttons, menus, status messages, instructions.
- **Question content**: Each question in the corpus exists in all supported languages. The pipeline uses a **generate-then-adapt** strategy: questions are researched and constructed in English first, then the agent rewrites them for other languages using the same facts and answer structure. This is not machine translation — it is constrained rewriting with access to the original research sources, producing natural phrasing while preserving semantic equivalence (same correct answer, same distractors, same `correct_index` across all language files).
- **Voice lines**: Narrator voice lines (UI announcements and question readouts) are generated per language with appropriate voices.
- **Category and subcategory names**: Displayed in the selected language. Stored in the i18n key-value files (e.g. `i18n/en.json`) using stable machine keys from the category taxonomy config.
- **Joker names**: Basic jokers (Reshuffle Selection, Reshuffle Question, Reveal Hint, The Gambler) are **translated** per language. Special jokers (Duel, Curse, Snipe, Double Down) are kept as **English proper nouns** across all languages — they are brand-like game terms. Duel is the one exception: German says "Duell".
- **Player references**: The narrator always refers to players by **color** (e.g. "Player Red"), never by custom name. Color names are translated per language. Custom player names appear in UI text only.

### Implementation

- Use a standard i18n key-value system for static UI strings (e.g. `i18n/en.json`, `i18n/de.json`).
- Each question lists its **supported languages** in metadata (e.g. `["en", "de"]` or just `["en"]`). Ideally all questions support all languages, but some may only be available in a subset. The game filters the corpus at runtime to questions that support the active language.
- Language-specific content within a question folder is organized by language code (e.g. `question.en.json`, `question.de.json`, `audio/teaser.en.mp3`, `audio/teaser.de.mp3`). See the Question Data Format section for the full folder structure.
- Language is selected once at app launch and applies globally. It can be changed in settings.

---

## 2. Question Generation Pipeline

### Overview

Questions are created by an **agentic pipeline** — an AI agent that researches topics on the web and constructs grounded, factual questions. The pipeline runs offline (not at game time) and produces a pre-generated corpus that ships with the app.

### Architecture

The pipeline is built on the **Claude Agent SDK** (`claude-agent-sdk`), which provides programmatic access to Claude Code as a full agentic system. The SDK handles the agentic loop, tool execution, and conversation management internally. Claude Code's built-in tools (WebSearch, Read, Write, Bash, etc.) are available out of the box, and custom tools (e.g. corpus checking, question writing) are defined as in-process MCP servers via the `@tool` decorator.

### Agent Workflow

For each question, the agent follows this process:

1. **Input**: Receives a prompt specifying the major category, subcategory, target difficulty, question type, and target languages.
2. **Research**: The agent performs a **web search** to find factual information relevant to the topic. Questions should be grounded in real, verifiable information — not purely made up from the model's training data.
3. **Question Construction**: Based on the research, the agent constructs the question in **English first** (primary language):
   - The question text and answer data (according to the question type schema)
   - The teaser title (ominous hint)
   - A hint for the "Reveal Hint" joker
   - Metadata (category, subcategory, difficulty, optional time limit)
4. **Language Adaptation**: For each additional target language, the agent rewrites the question using the same facts and answer structure. This produces natural phrasing per language while preserving semantic equivalence — the `correct_index`, distractor set, and factual core must be identical across all language files.
5. **Validation** (optional, enabled via `--validate` flag): A **separate agent run** with a cleared context receives the question + answers + research sources and independently verifies: (a) the correct answer is factually correct, (b) each distractor is definitively wrong, (c) no distractor could arguably also be correct. Low-confidence questions are flagged for human review.
6. **Output**: Writes the question as a structured folder (see Question Data Format below).

**Note on question types**: Audio/Listening questions are **deferred to a future version**. V1 supports multiple choice, sorting, map location, and calculation only. Audio questions require a separate manual curation workflow for sourcing audio clips that the automated pipeline cannot handle.

### Pipeline CLI

The pipeline is operated through a polished **command-line interface** with clear, real-time progress output.

#### `quizthat generate` — Single Question

Generates a single question interactively. The CLI shows live progress through each stage.

```
$ quizthat generate "An interesting physics question about black holes" \
    --category Science --subcategory Physics \
    --difficulty hard --languages en,de

  ● Researching topic...        searching "black hole physics"
  ✔ Research complete            3 sources found
  ● Constructing question...    building question + distractors
  ✔ Question constructed         "The Point of No Return"
  ● Validating...               checking correctness + duplicates
  ✔ Validation passed            no duplicates found
  ● Generating voice lines...   ElevenLabs API (en, de)
  ✔ Voice lines ready            6 files generated
  ✔ Done                         questions/a1b2c3d4/
```

- The prompt argument is a free-text description of what the question should be about. The agent uses this as its starting point for research.
- Flags for category, subcategory, difficulty, and languages. Sensible defaults where possible (e.g. `--languages` defaults to all configured languages).
- Each stage updates in-place on the terminal (spinner → checkmark) so the operator can follow progress.
- On failure at any stage, the CLI shows what went wrong and what was saved (partial output is kept in the question folder for inspection).

#### `quizthat generate-batch` — Bulk Generation

Generates multiple questions in bulk, targeting gaps in the corpus.

```
$ quizthat generate-batch \
    --category Science --subcategory Physics \
    --difficulty easy --count 50 --languages en,de

  Batch: 50 easy Science/Physics questions (en, de)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  12/50  24%
  ✔ 11 generated  ● 1 in progress  ✗ 0 failed  ⊘ 0 duplicates

  Latest: "The Speed of Light" (questions/f8e7d6c5/)
```

- Progress bar with counts for generated, in-progress, failed, and duplicate-rejected questions.
- Can run multiple agent workers in parallel (configurable concurrency).
- On completion, prints a summary: total generated, duplicates skipped, failures, and output directory.
- Supports `--dry-run` to preview what would be generated (lists the prompts, categories, and difficulties that would be used) without invoking the agent or TTS.

#### `quizthat corpus` — Corpus Management

Utility commands for inspecting and managing the existing corpus.

```
$ quizthat corpus stats                   # Show counts by category/difficulty/language
$ quizthat corpus gaps --languages en,de  # Show underpopulated buckets (human-readable table)
$ quizthat corpus gaps --json             # Machine-readable JSON output (for scripting)
$ quizthat corpus validate                # Re-run validation on existing questions
```

### General Pipeline Principles

- **Duplicate detection**: For V1, duplicate detection relies on **agent-level awareness** (the agent is instructed to avoid topics already covered in the corpus) and **human review**. Embedding-based cosine similarity deduplication is a planned future enhancement.
- **Generation logs**: Every question folder contains its generation audit trail (`generation/log.json`). Batch runs also produce a top-level batch log.
- **Incremental by design**: The `corpus gaps` command identifies where more questions are needed. Its default output is a human-readable table; the `--json` flag produces machine-readable output that can be piped into `generate-batch` to fill gaps automatically.

### Voice Line Generation

After question content is created, a separate pipeline step generates voice lines:

1. **Integration**: Use **ElevenLabs API** (or similar TTS provider) to generate audio from text.
2. **What gets voiced**:
   - The teaser title (short, read during question selection)
   - The full question text
   - Each answer option (read sequentially during the answer phase)
3. **Per language**: Each voice line is generated in the appropriate language with a language-appropriate voice.
4. **Output**: Audio files are stored alongside the question data in the question folder (see format below).
5. **Voice selection**: The ElevenLabs voice ID and generation parameters for each language are configured in a central config file. This allows tuning voice quality and swapping narrator voices without code changes.

Example `config/voices.yaml`:
```yaml
narrators:
  en:
    voice_id: EXAVITQu4vr4xnSDxMaL
    name: English Narrator
    model_id: eleven_multilingual_v2
    settings:
      stability: 0.55
      similarity_boost: 0.80
      style: 0.00
      use_speaker_boost: true
    output_format: mp3_44100_64
  de:
    voice_id: pNInz6obpgDQGcFmaJgB
    name: German Narrator
    model_id: eleven_multilingual_v2
    settings:
      stability: 0.55
      similarity_boost: 0.80
      style: 0.00
      use_speaker_boost: true
    output_format: mp3_44100_64
```

6. **Audio format**: All voice lines use **MP3 at 64 kbps, 44.1 kHz, mono** (`mp3_44100_64`). This provides universal compatibility across all platforms, adequate quality for speech, and is the native output format from ElevenLabs — no post-processing needed.
7. **Loudness normalization**: All voice lines are normalized to **-14 LUFS** (integrated loudness) using **dual-pass** ffmpeg normalization during the generation pipeline. The higher target (-14 vs. broadcast standard -16) ensures clarity on tablet speakers in noisy party environments. For clips under 3 seconds (e.g., short answer options), simple peak normalization is used instead of EBU R128, which produces unreliable results on very short audio.

---

## 3. Question Data Format

Each question is a **folder** containing all assets and metadata needed to present that question in the game. This makes questions self-contained, portable, and easy to inspect.

### Folder Structure

```
questions/
  {question-id}/
    meta.json                # Category, difficulty, time limit, supported languages
    question.en.json         # English: question text, answers, teaser title, hint
    question.de.json         # German: question text, answers, teaser title, hint
    audio/
      teaser.en.mp3          # English voice line for the teaser title
      teaser.de.mp3          # German voice line for the teaser title
      question.en.mp3        # English voice line for the question text
      question.de.mp3        # German voice line for the question text
      answer_0.en.mp3        # English voice line for answer option 0
      answer_1.en.mp3        # English voice line for answer option 1
      answer_2.en.mp3        # English voice line for answer option 2
      answer_3.en.mp3        # English voice line for answer option 3
      answer_0.de.mp3        # German voice line for answer option 0
      answer_1.de.mp3        # German voice line for answer option 1
      answer_2.de.mp3        # German voice line for answer option 2
      answer_3.de.mp3        # German voice line for answer option 3
    assets/                  # Optional: images (language-independent)
    generation/
      research.md            # The raw research the agent found (for auditing)
      prompt.md              # The prompt used to generate this question
      log.json               # Generation metadata: model, timestamp, batch ID
```

Not all language files need to be present — only those listed in `meta.json`'s `languages` array. A question with `"languages": ["en"]` would only have `question.en.json` and English audio files.

### meta.json Schema

```json
{
  "id": "uuid",
  "languages": ["en", "de"],
  "major_category": "Science",
  "subcategory": "Physics",
  "difficulty": "medium",
  "question_type": "multiple_choice",
  "time_limit_seconds": null,
  "version": 1,
  "created_at": "2026-02-28T12:00:00Z",
  "generation_batch": "batch-2026-02-28-001"
}
```

### question.json Schema

```json
{
  "teaser_title": "What Falls Up?",
  "question_text": "Which fundamental force is responsible for keeping planets in orbit around the Sun?",
  "hint": "Isaac Newton famously described this force after an apple-related incident.",
  "answer_data": {
    "options": [
      "Electromagnetic force",
      "Gravity",
      "Strong nuclear force",
      "Weak nuclear force"
    ],
    "correct_index": 1
  }
}
```

The `answer_data` field is polymorphic by question type:

**Sorting:**
```json
{
  "items": ["Nile", "Amazon", "Yangtze", "Mississippi"],
  "correct_order": [0, 1, 2, 3],
  "metric": "length in km"
}
```

**Map Location:**
```json
{
  "target": { "lat": 48.8566, "lng": 2.3522 },
  "scoring": [
    { "radius_km": 50, "label": "exact" },
    { "radius_km": 200, "label": "close" },
    { "radius_km": 500, "label": "region" }
  ]
}
```

**Calculation:**
```json
{
  "correct_value": 299792458,
  "tolerance": 0.01,
  "unit": "m/s"
}
```

---

## 4. Game Application

### Platform & Layout

- The app must be **natively playable on tablets and smartphones**.
- Layout is **tablet-first**: optimized for tablet landscape (primary use case). Phone portrait uses the same layout scaled down — no separate phone-specific UI adaptations for V1.
- The app runs as a **single shared-device experience** — all players interact with the same screen.

### Accessibility

- Each player is identified by a **color** (red, blue, green, yellow, purple, orange).
- All player references use the color name in text.

### Settings & Defaults

The game should ship with **strong defaults** so that most groups can skip configuration entirely:

| Setting | Default | Options |
|---------|---------|---------|
| Board size | 4x4 | fixed — not configurable |
| Placement candidates | 2 | 1–4 |
| Starting pegs | 0 | 0–N (configurable) |
| Language | Device language | en, de |

Advanced settings (placement candidates, starting pegs) should be tucked behind an "Advanced" toggle so they don't overwhelm new players.

---

## 5. Screen Flow & UI Specification

### 5.1 Start Screen

The app opens to a start screen with:

- Game logo and title
- **"New Game"** button (primary action)
- **"Settings"** button (language, audio, accessibility options)
- **"How to Play"** / tutorial link

### 5.2 Player Setup Screen

Reached from "New Game". Players configure their session:

- **Player list**: Add 2–6 players. For each player:
  - Enter a **name** (optional — defaults to the color name, e.g. "Red")
  - Pick a **color** from the available palette (each color can only be picked once)
  - Select **expertise**: up to 2 major categories + up to 2 subcategories. Use tappable category cards that expand to show subcategories.
- **Quick Start presets** for expertise selection (e.g. "History Buff", "Science Nerd", "Pop Culture Fan") to speed up setup.
- **Game settings** section (collapsible, defaults pre-filled):
  - Placement candidates
  - Starting pegs (the only game-length dial, since the board is fixed at 4x4)
- **"Start Game"** button at the bottom.

### 5.3 Turn Gate Screen

Displayed **between every player transition** — this is the handoff moment.

- Full-screen overlay in the **upcoming player's color**.
- Shows: **"[Player Name]'s Turn"** with their color.
- Narrator voice line: **"Player [Color], your turn."** (localized)
- All other information is hidden. No boards, no jokers, no question previews.
- **0.5-second lockout**: Taps are ignored for 0.5 seconds after the Turn Gate appears, preventing accidental tap-through during device handoff. The "Tap to continue" text fades in after the lockout.
- The player **taps to continue** into their question selection.

### 5.4 Question Selection Screen

The core decision screen. Layout:

- **4 question cards** arranged vertically. Each card shows:
  - The **teaser title** (large text, prominent)
  - The **major category** the question is drawn from (e.g. "Science", "History")
  - The **difficulty** as an icon (e.g. one star for Easy, two for Medium, three for Hard, four for Very Hard)
  - The **slot type** indicated by visual styling: Slot 1 has a bronze border/accent, Slots 2/3 silver, Slot 4 gold
  - For Slots 2/3: the **board constraint** (e.g. "Column B / Row 3")
  - For Slot 4: a label like "Choose your placement"
  - Cards that carry the **2x boost** show a "2x" chip; cards that award a joker show a "JOKER" chip. Both overhang the card's top edge.
- **Narrator reads out** each teaser title in sequence (short lines, should take ~10 seconds total).
- **Joker tray** at the bottom of the screen: small icons for each joker. Usable jokers (Reshuffle Selection, The Gambler) are fully visible; others are **dimmed** (not applicable in this phase). Spent jokers are **grayed out**.
- The player **taps a card** to select that question.

### 5.5 Question Screen

After selecting a question:

- The **question text** is displayed prominently.
- The **narrator reads the question aloud**, then reads each answer option.
- **Answer options** are displayed as large, tappable buttons (always 4 for multiple choice).
- **Joker tray** at the bottom: Reshuffle Question and Reveal Hint are now active (if available); others are dimmed.
- If a **soft time limit** applies: the screen background gradually shifts color (normal → amber → pulsing red border) as time runs out. A gentle audio heartbeat increases in tempo in the final seconds. No numerical countdown by default.
- For **special question types** (V1):
  - **Sorting**: Always **4 items**. Drag-and-drop list with large pill-shaped items (using SortableJS for touch-friendly drag on mobile/WebView), with **tap-to-swap as fallback** (tap item A, then tap item B to swap positions).
  - **Map Location**: Zoomable map (Leaflet) with a crosshair reticle. Player pans the map under the reticle. Accuracy radius shown as a translucent circle. "Confirm" button to lock in the answer. Map tiles are loaded from a bundled tile set for offline support.
  - **Calculation**: Custom numeric keypad embedded in the screen (not the OS keyboard). Question text at top, answer field in middle, keypad at bottom. Keys: **digits 0-9, decimal point, negative sign, comma separator, backspace, submit**.
  - **Audio/Listening**: Deferred to a future version.

### 5.6 Answer Result Screen

After the player submits their answer:

- **Correct**: Brief celebratory animation/sound. Transition to the Board Update Screen.
- **Wrong**: The screen shows "Incorrect!" but does **not** reveal the correct answer yet. The game transitions to the **Pass Screen** (see 5.7). If no pass is applicable (e.g. round 1 where there is no previous-round player), the correct answer is revealed and the turn ends → Turn Gate for next player.

### 5.7 Pass Screen

When a wrong answer triggers the pass mechanic:

- A transition screen styled as a mini Turn Gate: **"[Previous-round Player Name], your chance!"**
- The previous-round player taps to continue.
- If the original question had a soft time limit, the pass player gets a **fresh timer** (reset, not continued from the original).
- They see the **same question** with answer options **in a scrambled order** (so positional memory from watching doesn't help).
- They can answer or tap a **"Decline"** button to skip.
- After they answer (or decline), the **correct answer is revealed** to everyone.
- If they answered correctly: transition to Board Update Screen (with Slot 1-style random placement).

### 5.8 Board Update Screen

Shown after a correct answer. This is the peg placement moment.

- The player's **board is shown large**, centered on screen.
- **Animation**: The game highlights candidate fields one by one in a brief shuffling animation (like a roulette), then settles on the final candidates that the player can pick from.
- If **placement candidates > 1**: The candidate fields pulse/glow and the player taps to choose one.
- If **placement candidates = 1**: The peg is auto-placed with a satisfying drop animation.
- If **Slot 4 (free placement)**: All empty fields are available. The player taps any empty field.
- After placement: brief celebration animation, then transition to Turn Gate for the next player.
- If this peg **completes a line**: Victory screen (see 5.9).

### 5.9 Victory Screen

- Full-screen celebration: **"[Player Name] wins!"** with their color, confetti animation, and a triumphant narrator voice line.
- Show the winning board with the completed line highlighted.
- **"Play Again"** and **"Back to Menu"** buttons.

---

### 5.10 Battle Screens

A battle runs after every full round (see IDEA.md, Battle Games). Four screens, in sequence:

**Battle Intro** — announces that a battle is starting and which format it is. Tap to continue.

**Battle Gate** — the same shape as the turn gate: the next player's colour fills the screen, their name is large, and a tap begins their answer. Its job is to stop the previous player's answer being on screen when the device changes hands.

**Battle Answering** — the format's own input:
- *Estimation*: the numeric keypad from the calculation question, with the unit shown.
- *Map placement*: the Leaflet map from the map question, but with **no feedback** — no target marker, no distance line. Revealing where the answer was would hand it to everyone still to play.

**Battle Reveal** — the true value, every player's answer, and the ranking. Then the peg transfer is shown on the two affected boards. Tap to continue into the next round.

### Battle Ranking and Transfer

| Rule | Behaviour |
|------|-----------|
| Ranking metric | Absolute difference from the true value (estimation) or great-circle distance in km (map placement) |
| Who is affected | Only first and last place; everyone in between is untouched |
| Transfer | One random peg of the loser's moves to **the same coordinates** on the winner's board |
| Winner's square occupied | Draw again among the loser's remaining pegs; if all clash, no transfer |
| Tie for first or last | No transfer |
| Loser has no pegs | No transfer |
| Win check | **Not** performed on a battle transfer — a battle can never end the game |

### Battle Question Type

Battle questions are a distinct `question_type` and are **excluded from ordinary turn generation**.

```
meta.json
  question_type: "estimation" | "battle_map"
  battle_only: true
```

`answer_data` for `estimation`:

| Field | Type | Notes |
|-------|------|-------|
| correct_value | number | The true value |
| unit | string | Shown next to the input, e.g. "m", "Jahre" |

`answer_data` for `battle_map` reuses the `map_location` shape (`target.lat`, `target.lng`), minus the `scoring` radii — a battle ranks by distance rather than scoring bands.

## 6. Narrator / Voice System

The game features a **narrator** that reads out key moments using pre-generated and dynamic voice lines.

### Pre-Generated Voice Lines (shipped with the app)

These are UI-level voice lines, not question-specific:

- **Turn transitions**: "Player [Color], your turn." (one per color per language)
- **Pass transitions**: "[Color], your chance!" (one per color per language)
- **Correct/incorrect reactions**: **5 correct** and **5 incorrect** variations each for variety.
- **Victory**: "[Color] wins!" / "Congratulations!" etc.
- **Joker activations**: Short callouts like "Reshuffle!", "The Gambler!", "Snipe!", etc.

### Question Voice Lines (per question, from the generation pipeline)

- **Teaser title readout**: The narrator reads the teaser during question selection.
- **Question readout**: The narrator reads the full question text.
- **Answer option readouts**: Each answer option is a **separate audio file** (`answer_0`, `answer_1`, `answer_2`, `answer_3`). The narrator reads them sequentially with small pauses between options. Per-option files allow clean interruption when a player taps an answer mid-narration, and enable per-option replay.

### Background Music

The game plays a **background music loop** during gameplay. The music is a subtle ambient track that adds atmosphere without competing with narrator voice lines. Music volume is automatically ducked when a voice line plays and restored afterward.

- The music track is sourced separately (not generated by TTS) and bundled as an MP3 file.
- A **music volume** slider and **music on/off** toggle are available in settings.
- Music starts when the game begins (TURN_START) and stops on the Victory screen.

### Technical Requirements

- Audio playback must work reliably on tablet/phone speakers in a noisy social environment — lines should be clear, well-paced, and not too quiet.
- Voice lines should be **skippable** (tap to skip narration and go straight to interaction). Use a **200ms fade-out** on skip — fast enough to feel responsive, avoids harsh audio cuts.
- A **volume control** and **mute toggle** must be available in settings and accessible during gameplay.
- All voice lines are stored as **MP3, 64 kbps, 44.1 kHz, mono**. All files are loudness-normalized to -14 LUFS (dual-pass) during the generation pipeline.

---

## 7. Board Viewer

Players must be able to inspect **any player's board at any time** during the game.

### Access

- A persistent **icon/button in the top bar** (e.g. a grid icon or "Boards" label) that opens the board viewer overlay.
- Available on every game screen (question selection, question answering, board update, etc.) — never hidden.

### Board Viewer Overlay

- Opens as a **modal overlay** that dims the background to ~60% opacity and **blocks all interaction** with the underlying screen. This prevents conflicting tap targets with question cards and other interactive elements.
- Toggle via the board viewer button in the top bar (tap to open, tap again to close).
- Shows **all player boards** in a compact grid layout (2-row layout for 4-6 players, single row for 2-3).
- Each board is labeled with the player's name and color.
- **Tap-to-zoom**: Tapping any board expands it to near-full-screen for detailed inspection. Tap again or swipe to dismiss.
- Shows **peg count** per player for quick comparison.
- The overlay does **not** pause the game or interrupt the current phase — it's purely informational. Note: if a soft time limit is running on the Question Screen, it continues while the overlay is open.

---

## 8. Game State Machine

This section defines the formal game state machine. It specifies every discrete state the game can be in, the legal transitions between them, which actions (including jokers) are available in each state, and how edge cases are resolved.

### States

```
SETUP                — Players configuring names, colors, expertise, settings
TURN_START           — Resolve modifiers (Curse), determine 2x boost, generate 4 slot options
SELECTION            — Player views 4 question cards and joker tray
GAMBLER_CONFIRM      — Player sees which peg is staked, confirms or cancels
GAMBLER_QUESTION     — Player answers the Gambler's random question
GAMBLER_RESOLVE      — Award 3 pegs (correct) or remove staked peg (wrong)
QUESTION_DISPLAY     — Selected question shown, narrator reads it
ANSWER_CORRECT       — Correct answer celebration, determine peg count
ANSWER_WRONG         — Show "Incorrect!", check if pass is applicable
BATTLE_INTRO         — Announces the battle at the end of a round, names the format
BATTLE_GATE          — Mini turn gate naming the player who answers next
BATTLE_ANSWERING     — That player enters their guess or drops their pin
BATTLE_REVEAL        — All answers, the true value, the ranking and the peg transfer
PASS_GATE            — Mini turn gate for the previous-round player
PASS_ANSWERING       — Previous-round player sees scrambled question
PASS_RESOLVE         — Reveal correct answer, award peg if applicable
PEG_PLACEMENT        — Board shown, candidate animation, player picks field
WIN_CHECK            — Check all lines on the placing player's board
VICTORY              — A player completed a line — game over
TURN_END             — Clean up turn state, advance to next player
```

JOKER_TARGET_SELECT and JOKER_SNIPE_SELECT are **sub-states within SELECTION** — they appear as modals over the question selection screen, not as separate screens.

### State Transition Diagram

```
SETUP
  │
  ▼
TURN_START ◄─────────────────────────────────────────── TURN_END
  │                                                        ▲
  ▼                                                        │
SELECTION ◄───────────────────────┐                        │
  │                               │                        │
  ├── [Reshuffle Selection] ──────┘ (regenerate 4 options)  │
  │                                                        │
  ├── [Duel/Curse/Snipe] ──► target modal ──► resolve ──► SELECTION
  │                                                        │
  ├── [The Gambler] ──► GAMBLER_CONFIRM                    │
  │                         │                              │
  │                         ├── [cancel] ──► SELECTION     │
  │                         │                              │
  │                         └── [confirm] ──► GAMBLER_QUESTION
  │                                              │         │
  │                                              ▼         │
  │                                        GAMBLER_RESOLVE  │
  │                                              │         │
  │                              [correct] ──► PEG_PLACEMENT (×3)
  │                              [wrong] ──► remove peg ──► TURN_END
  │                                                        │
  └── [select slot] ──► QUESTION_DISPLAY ◄──┐              │
                             │              │              │
                             ├── [Reshuffle Question] ─────┘ (new question, same category)
                             ├── [Reveal Hint] ──► show hint, stay
                             ├── [Double Down] ──► flag turn, stay
                             │                              │
                             └── [submit answer]            │
                                      │                     │
                          ┌───────────┴───────────┐         │
                          ▼                       ▼         │
                   ANSWER_CORRECT           ANSWER_WRONG    │
                          │                       │         │
                          │          ┌────────────┴────┐    │
                          │          ▼                 ▼    │
                          │    [round ≥ 2]      [round 1]   │
                          │          │          reveal ──► TURN_END
                          │          ▼                      │
                          │     PASS_GATE                   │
                          │          │                      │
                          │          ▼                      │
                          │     PASS_ANSWERING              │
                          │          │                      │
                          │    ┌─────┼──────┐               │
                          │    ▼     ▼      ▼               │
                          │ correct wrong decline            │
                          │    │     │      │               │
                          │    ▼     ▼      ▼               │
                          │     PASS_RESOLVE                │
                          │     │         │                 │
                          │  [peg] ──► PEG_PLACEMENT        │
                          │  [no peg] ──► reveal ──► TURN_END
                          │                                 │
                          ▼                                 │
              [Slot 4] ──► award special joker              │
                          │                                 │
                          ▼                                 │
                    PEG_PLACEMENT                           │
                          │                                 │
                          ▼                                 │
                      WIN_CHECK                             │
                          │                                 │
                    ┌─────┼──────────┐                      │
                    ▼     ▼          ▼                      │
                VICTORY  more pegs  all placed              │
                         ▼          └──────────────► TURN_END
                    PEG_PLACEMENT
```

### Transition Table

#### SETUP → TURN_START

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Start game | All players configured | TURN_START | Initialize boards (apply starting pegs if configured), set round = 1, set current player to first in order |

#### TURN_START → SELECTION

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Round complete (last player's turn ends) | Nobody has won | BATTLE_INTRO | Pick a battle question not yet used; reset battle answers |
| Tap | — | BATTLE_GATE | Name the first player who has not answered |
| Tap | — | BATTLE_ANSWERING | Show that format's input |
| Answer submitted | More players to go | BATTLE_GATE | Store the answer, name the next player |
| Answer submitted | Everyone has answered | BATTLE_REVEAL | Rank by closeness, resolve the peg transfer |
| Tap | — | TURN_START | Begin the next round |
| Turn begins | — | SELECTION | 1. If player is cursed: force Slots 1–3 to Hard difficulty (Slot 4 keeps normal 50/50 Hard/Very Hard), consume curse. 2. Mark each slot with a 2x badge at ~8% chance (raised to ~35% per slot if round ≥ 3 and the player has the fewest correct answers). Mark Slot 4 as awarding a joker always, and Slots 2/3 at ~35% each; Slot 1 never. 3. Generate 4 slot options (expertise question for Slot 1, random for 2/3, hard/very hard for 4). 4. Generate board constraints for Slots 2/3. |

#### SELECTION

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Select a slot | — | QUESTION_DISPLAY | Load the selected question, record selected slot |
| Use Reshuffle Selection | Joker available, not used this turn | SELECTION | Discard current 4 options, generate 4 new ones (preserving 2x badges if applicable), consume joker |
| Use The Gambler | Joker available, player has ≥1 peg | GAMBLER_CONFIRM | Randomly select a peg to stake, show confirmation |
| Use Duel | Joker available, ≥1 opponent has ≥1 peg | BATTLE_INTRO | Show opponent selection modal → run a two-player battle → challenger wins: one random peg of the opponent's moves to the same square of the challenger's board; challenger loses or ties: nothing happens → returns to SELECTION → consume joker |
| Use Curse | Joker available | SELECTION (via modal) | Show target selection modal → mark target as cursed for next turn → consume joker |
| Use Snipe | Joker available, ≥1 opponent has ≥1 peg | SELECTION (via modal) | Show target selection modal → show target's board → player taps field to remove → consume joker |

#### GAMBLER_CONFIRM

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Confirm | — | GAMBLER_QUESTION | Load a random question (any category, any difficulty), display it |
| Cancel | — | SELECTION | Return to question selection, joker not consumed |

#### GAMBLER_QUESTION

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Submit answer | — | GAMBLER_RESOLVE | Check correctness |

#### GAMBLER_RESOLVE

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Correct | — | PEG_PLACEMENT | Set pegs_remaining = 3, placement = random anywhere (Slot 1 rules), consume Gambler joker |
| Wrong | — | TURN_END | Remove the staked peg from board, consume Gambler joker |

#### QUESTION_DISPLAY

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Submit answer (correct) | — | ANSWER_CORRECT | — |
| Submit answer (wrong) | — | ANSWER_WRONG | — |
| Use Reshuffle Question | Joker available, not used this turn | QUESTION_DISPLAY | Replace question with new one from same category, consume joker |
| Use Reveal Hint | Joker available, not used this turn, hint exists | QUESTION_DISPLAY | Display hint text, consume joker |
| Use Double Down | Joker available, not used this turn | QUESTION_DISPLAY | Set double_down_active = true, consume joker |

#### ANSWER_CORRECT

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Proceed | — | PEG_PLACEMENT | Calculate pegs_remaining (see Peg Count Calculation). If Slot 4: award a random special joker (Duel, Curse, Snipe, or Double Down). If Slot 1/2/3: roll for basic joker re-earn (see Basic Joker Re-Earning below). |

#### ANSWER_WRONG

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Proceed | Round ≥ 2 and previous-round player exists | PASS_GATE | Identify the previous-round player |
| Proceed | Round 1 or no previous-round player | TURN_END | Reveal correct answer |

#### PASS_GATE

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Player taps to continue | — | PASS_ANSWERING | Show the same question with scrambled answer order |

#### PASS_ANSWERING

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Submit answer (correct) | — | PASS_RESOLVE | Mark peg_awarded = true |
| Submit answer (wrong) | — | PASS_RESOLVE | Mark peg_awarded = false |
| Decline | — | PASS_RESOLVE | Mark peg_awarded = false |

#### PASS_RESOLVE

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Proceed | peg_awarded = true | PEG_PLACEMENT | Set pegs_remaining = 1, placement = random anywhere (Slot 1 rules), placing_player = pass player. Reveal correct answer. |
| Proceed | peg_awarded = false | TURN_END | Reveal correct answer |

#### PEG_PLACEMENT

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Player picks field | candidates > 1 or free placement | WIN_CHECK | Place peg, decrement pegs_remaining |
| Auto-place | candidates = 1 | WIN_CHECK | Place peg at the single candidate, decrement pegs_remaining |

#### WIN_CHECK

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Line completed | — | VICTORY | Record winner |
| No line, pegs_remaining > 0 | — | PEG_PLACEMENT | Generate next set of candidates for the next peg |
| No line, pegs_remaining = 0 | — | TURN_END | — |

#### TURN_END

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Proceed | Game not over | TURN_START | Advance current_player to next in order. If wrapping around: increment round. Clear turn-specific flags (double_down_active, jokers_used_this_turn). Record previous-round player for pass mechanic. |

#### VICTORY

| Event | Condition | Next State | Side Effects |
|-------|-----------|------------|--------------|
| Play Again | — | SETUP | Reset all game state |
| Back to Menu | — | (app exit) | — |

### Joker Legality by State

| Joker | Legal State | Conditions | Consumed On |
|-------|-------------|------------|-------------|
| Reshuffle Selection | SELECTION | Available in inventory, not yet used this turn | Use |
| The Gambler | SELECTION | Available in inventory, player has ≥1 peg, not yet used this turn | Confirm (not on cancel) |
| Reshuffle Question | QUESTION_DISPLAY | Available in inventory, not yet used this turn | Use |
| Reveal Hint | QUESTION_DISPLAY | Available in inventory, not yet used this turn, question has a hint | Use |
| Double Down | QUESTION_DISPLAY | Available in inventory, not yet used this turn | Use |
| Duel | SELECTION | Available in inventory, ≥1 opponent has ≥1 peg | Use |
| Curse | SELECTION | Available in inventory | Use |
| Snipe | SELECTION | Available in inventory, ≥1 opponent has ≥1 peg | Use |

**Rules:**
- Multiple jokers may be used in a single turn, but **not the same type twice**.
- The `jokers_used_this_turn` set tracks which types have been used.
- Jokers are **never** available during PASS_ANSWERING, GAMBLER_QUESTION, or any sub-turn.

### Peg Count Calculation

The total pegs awarded on a correct answer is **additive**:

| Modifier | Extra Pegs | Condition |
|----------|-----------|-----------|
| Base | 1 | Always |
| 2x Boost | +1 | Player selected a 2x-marked slot (~8% per slot, ~35% for the trailing player from round 3) |
| Double Down | +1 | Player activated Double Down joker during QUESTION_DISPLAY |

**Maximum per normal answer: 3 pegs** (base + 2x + Double Down).

Slot 4 correct answers also award a random special joker, independent of peg count.

**The Gambler** is a separate flow: always awards exactly **3 pegs** on success. 2x boost and Double Down do not apply to Gambler questions.

**Pass mechanic**: always awards exactly **1 peg** with Slot 1-style random placement. No modifiers apply.

### Peg Placement Rules by Context

| Context | Placement Rule |
|---------|---------------|
| Slot 1 correct | N random candidates from entire board; player picks one |
| Slot 2/3 correct | N random candidates within the revealed row or column; player picks one |
| Slot 4 correct | Free placement — player picks any empty field |
| Pass correct | N random candidates from entire board (Slot 1 rules); pass player picks one |
| Gambler correct (×3) | N random candidates from entire board (Slot 1 rules); player picks one, repeated 3 times |
| Duel effect | The challenger must win the battle question; the peg is then transferred to the same coordinates on their own board, skipping squares they already hold. A loss or a tie moves nothing |

N = configured placement candidates (1–4). When N = 1, placement is automatic (no player choice).

### Multi-Peg Placement Sequencing

When pegs_remaining > 1 (from 2x boost, Double Down, or Gambler):

1. Generate candidates for peg #1 according to placement rules
2. Player picks (or auto-place if N=1)
3. WIN_CHECK — if line completed → VICTORY (remaining pegs are **not** placed)
4. If no win: generate candidates for peg #2 (from the updated board state — peg #1 is now placed)
5. Repeat until pegs_remaining = 0 or VICTORY

Each peg placement uses the **same placement rules** as the originating slot. For example, 2x on a Slot 2/3 question means both pegs are placed within the same revealed row or column.

### Special Joker Activation Flow

Special jokers (Duel, Curse, Snipe) are activated from the joker tray on the question selection screen. They open modals over the current screen:

**Duel:**
```
SELECTION → tap Duel in tray
  → Opponent selection modal (opponent avatars, empty boards excluded)
  → Player taps an opponent
  → BATTLE_INTRO → BATTLE_GATE → BATTLE_ANSWERING (both players) → BATTLE_REVEAL
  → Challenger closer: one random peg transfers to the same square of their board
  → Challenger further off or tied: nothing happens
  → Back to SELECTION, the challenger's turn continues
```

**Curse:**
```
SELECTION → tap Curse in tray
  → Target selection modal (opponent avatars)
  → Player taps an opponent
  → Target marked as cursed (visual indicator on their avatar)
  → Modal closes → SELECTION
```

**Snipe:**
```
SELECTION → tap Snipe in tray
  → Target selection modal (opponent avatars)
  → Player taps an opponent
  → Target's board zooms in, pegs are tappable
  → Player taps a specific peg to remove
  → Confirmation: "Remove peg at [field]?"
  → Peg removed (animated)
  → Modal closes → SELECTION
```

After any special joker resolves, the player still needs to select a question slot to proceed.

### Edge Cases

1. **Round 1 pass**: No previous-round player exists. ANSWER_WRONG goes directly to reveal answer → TURN_END.
2. **Gambler + 2x boost**: The Gambler bypasses normal slot selection, so the 2x boost does not apply. Gambler always awards exactly 3 pegs on success.
3. **Double Down + 2x boost**: Additive. 1 (base) + 1 (2x) + 1 (Double Down) = 3 pegs.
4. **Curse**: Applied during TURN_START. Slots 1–3 are forced to **Hard** difficulty. Slot 4 keeps its normal 50/50 Hard/Very Hard distribution (it is already at least Hard by design). The curse is consumed after generation — it applies once, even if the player uses Reshuffle Selection (the new options are also cursed).
5. **Reshuffle Selection while cursed**: The new 4 options are also all cursed (Slots 1–3 Hard, Slot 4 normal) — the curse persists for the entire SELECTION phase.
6. **Reshuffle Selection with 2x boost**: The 2x badges are re-randomized on the new 4 options (2 random slots get the badge again).
7. **Pass player's entire board is full**: Impossible — if all fields are filled, they would have already completed a line and won.
8. **Duel/Snipe when all opponents have 0 pegs**: The joker is dimmed in the tray and cannot be activated.
9. **Multiple special jokers in one turn**: Allowed (if different types). Each resolves via its modal before the next can be activated.
10. **The Gambler with exactly 1 peg**: Allowed. If wrong, that peg is removed and the player drops to 0 pegs.
11. **Win during multi-peg placement**: If peg #1 (of 2 or 3) completes a line, the game ends immediately. Remaining pegs are not placed.
12. **Special joker earned from Slot 4 in the same turn**: Special jokers earned from Slot 4 are added to inventory but **cannot be used in the same turn**. The joker appears in the joker tray but is visually **dimmed/locked** until the player's next turn.
13. **"Previous round player" definition**: The player whose turn was immediately before in turn order. In a 4-player game with order [A, B, C, D]: when it's B's turn, the previous-round player is A. When it's A's turn (new round), the previous-round player is D. First turn of the entire game → null (no pass).

---

## 9. Game Session Data Model

This section defines the data model for a running game session — all persistent and transient state needed to fully represent a game at any point and to support auto-save/resume.

### Entity Overview

```
GameSession
  ├── GameSettings
  ├── Player[]  (2–6)
  │     ├── Expertise
  │     ├── Board
  │     ├── JokerInventory
  │     └── Stats
  ├── TurnState  (transient, current turn only)
  │     ├── OfferedSlots[]  (4)
  │     └── PassState
  └── TurnHistory[]  (log of completed turns)
```

### GameSession

The top-level container for a single game.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique session identifier |
| status | enum | `setup`, `in_progress`, `finished` |
| settings | GameSettings | Game configuration (see below) |
| players | Player[] | Ordered list of players (index = seat order) |
| current_player_index | int | Index into `players` for whose turn it is |
| round | int | Current round number (starts at 1, increments when turn order wraps) |
| state | enum | Current game state (from Section 8 state enum) |
| turn | TurnState \| null | Transient state for the active turn (null between turns) |
| winner_player_index | int \| null | Index of the winning player (null until game ends) |
| used_question_ids | Set\<UUID\> | All question IDs shown this session (prevents repeats) |
| history | TurnHistory[] | Log of completed turns |
| created_at | datetime | When the session was created |
| updated_at | datetime | Last state change (for auto-save) |
| rng_seed | int | Seed for the session's PRNG (enables deterministic replay) |

### GameSettings

Configuration chosen during setup. Immutable once the game starts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| ~~board_size~~ | — | — | Removed. The board is always 4x4; see `BOARD_SIZE` in `types/session.ts`. |
| placement_candidates | int | 2 | 1–4; how many candidate fields to offer per peg placement |
| starting_pegs | int | 0 | 0–N; pre-populated pegs per player |
| language | string | device lang | `en`, `de`, etc. |

### Player

Per-player state that persists throughout the game.

| Field | Type | Description |
|-------|------|-------------|
| index | int | Seat position (0-based, determines turn order) |
| name | string | Display name (defaults to color name) |
| color | enum | `red`, `blue`, `green`, `yellow`, `purple`, `orange` |
| expertise | Expertise | Category selections |
| board | Board | Current board state |
| jokers | JokerInventory | Current joker counts |
| stats | PlayerStats | Running statistics |
| is_cursed | bool | Whether this player's next turn is cursed (forced Hard difficulty) |

#### Expertise

| Field | Type | Description |
|-------|------|-------------|
| major_categories | string[] | Up to 2 major categories (e.g. `["Science", "History"]`) |
| subcategories | string[] | Up to 2 specific subcategories (e.g. `["Physics", "Middle Ages"]`) |

#### Board

The board is a 4×4 grid (`BOARD_SIZE` in `types/session.ts`).

| Field | Type | Description |
|-------|------|-------------|
| size | int | 3, 4, or 5 |
| fields | bool[][] | N×N matrix; `true` = peg placed, `false` = empty. Indexed as `fields[row][col]`. |
| peg_count | int | Denormalized count of placed pegs (for quick lookup) |

Columns are labeled A, B, C, ... (mapped from col index 0, 1, 2, ...).
Rows are labeled 1, 2, 3, ... (mapped from row index 0, 1, 2, ...).
Field "B3" = `fields[2][1]`.

#### JokerInventory

Tracks the count of each joker type. Starts at 1 each for basic jokers, 0 for special jokers. Basic joker counts can exceed 1 if jokers are re-earned. Special jokers are **capped at 1 per type** — a player can hold at most 1 Duel, 1 Curse, 1 Snipe, and 1 Double Down simultaneously.

| Field | Type | Start | Description |
|-------|------|-------|-------------|
| reshuffle_selection | int | 1 | Reshuffle the 4 question options |
| reshuffle_question | int | 1 | Replace the current question |
| reveal_hint | int | 1 | Show a hint |
| the_gambler | int | 1 | Stake a peg for a high-risk question |
| duel | int | 0 | Challenge an opponent for one of their pegs |
| curse | int | 0 | Force Hard difficulty on an opponent's next turn |
| snipe | int | 0 | Remove a specific peg from an opponent |
| double_down | int | 0 | Next correct answer awards +1 extra peg |

#### PlayerStats

Running statistics tracked per player throughout the game.

| Field | Type | Description |
|-------|------|-------------|
| questions_attempted | int | Total questions answered (excluding passes) |
| questions_correct | int | Total correct answers, **including Gambler questions** (used for 2x boost eligibility) |
| passes_received | int | Times this player received a passed question |
| passes_correct | int | Times they answered a pass correctly |
| jokers_used | int | Total jokers consumed |
| pegs_stolen_from | int | Pegs lost to a Duel, a Snipe or a round battle |

### TurnState

Transient state for the current turn. Created at TURN_START, destroyed at TURN_END.

| Field | Type | Description |
|-------|------|-------------|
| active_player_index | int | Whose turn it is |
| previous_round_player_index | int \| null | Player who answered in the previous round (null in round 1) |
| phase | enum | Current state from Section 8 (`selection`, `question_display`, `peg_placement`, etc.) |
| offered_slots | OfferedSlot[4] | The 4 question options generated for this turn |
| selected_slot_index | int \| null | Which slot (0–3) the player picked |
| selected_question_id | UUID \| null | The loaded question |
| boosted_slot_indices | int[] | Which slot indices have the 2x badge (0–2 entries) |
| curse_active | bool | Whether this turn was cursed (all slots forced Hard) |
| double_down_active | bool | Whether Double Down joker was activated |
| hint_revealed | bool | Whether the hint has been shown |
| jokers_used_this_turn | Set\<string\> | Joker types used this turn (prevents same-type reuse) |
| pegs_remaining | int | Pegs left to place (for multi-peg sequences) |
| placement_rule | PlacementRule | How the current peg should be placed |
| placing_player_index | int | Who is placing the peg (may differ during pass) |
| gambler_staked_field | [int, int] \| null | [row, col] of the staked peg (null if not gambling) |
| pass | PassState \| null | Sub-state for the pass mechanic (null if not in pass flow) |
| special_joker_earned | string \| null | Which special joker was earned from Slot 4 (null if N/A) |
| basic_joker_earned | string \| null | Which basic joker was earned from a Slot 1/2/3 correct answer (null if N/A) |

#### OfferedSlot

| Field | Type | Description |
|-------|------|-------------|
| slot_type | enum | `expertise`, `standard`, `hard` |
| question_id | UUID | The question behind this slot |
| teaser_title | string | The ominous title shown on the card |
| major_category | string | Major category for display |
| difficulty | enum | `easy`, `medium`, `hard`, `very_hard` |
| constraint | Constraint \| null | Board constraint for standard slots (null for expertise/hard) |
| has_2x_boost | bool | Whether this slot is marked with 2x |

#### Constraint

| Field | Type | Description |
|-------|------|-------------|
| type | enum | `row` or `column` |
| index | int | Which row (0-based) or column (0-based) |
| display | string | Human-readable label, e.g. "Column B / Row 3" |

#### PlacementRule

| Field | Type | Description |
|-------|------|-------------|
| type | enum | `random_board`, `constrained`, `free` |
| constraint | Constraint \| null | For `constrained`: which row/column |
| candidates_count | int | How many candidates to offer (from settings, or all for `free`) |

#### PassState

| Field | Type | Description |
|-------|------|-------------|
| pass_player_index | int | The player receiving the pass |
| original_answer_index | int | Which answer the original player selected (for scramble logic) |
| scrambled_order | int[] | Permutation of answer option indices |
| result | enum \| null | `correct`, `wrong`, `declined` (null until resolved) |

### TurnHistory

A log entry for each completed turn. Used for statistics, replay, and debugging.

| Field | Type | Description |
|-------|------|-------------|
| turn_number | int | Sequential turn count (1-based) |
| round | int | Which round this turn belonged to |
| player_index | int | Whose turn it was |
| slot_selected | int | Which slot (0–3) was picked, or -1 for Gambler |
| question_id | UUID | The question that was answered |
| answer_correct | bool | Whether the active player answered correctly |
| jokers_used | string[] | Which joker types were used during this turn |
| pegs_placed | [int, int][] | List of [row, col] where pegs were placed |
| pegs_placed_by | int | Player index who placed the pegs (differs during pass) |
| pass_occurred | bool | Whether the question was passed |
| pass_result | enum \| null | `correct`, `wrong`, `declined`, null |
| special_joker_earned | string \| null | Which special joker was earned (if any) |
| basic_joker_earned | string \| null | Which basic joker was re-earned (if any) |
| duel_result | { opponent_index: int, won: bool, field: [int, int] \| null } \| null | Duel details if used |
| snipe_target | { player_index: int, field: [int, int] } \| null | Snipe details if used |
| curse_target | int \| null | Player index who was cursed (if any) |

### Auto-Save & Resume

The entire `GameSession` object is the save format. The game auto-saves by serializing the full session (including `TurnState`) after every state transition.

**Save triggers:** After every state transition (every event in the transition table from Section 8). This ensures the game can resume from exactly where it was interrupted.

**Resume flow:**

1. On app launch, check for a saved session with `status = in_progress`
2. If found, show a "Resume Game?" prompt with a summary (player names, round number, current player)
3. If resumed: restore full state, navigate to the screen matching `turn.phase`
4. If declined: delete the save, show the start screen

**Storage:** Serialize as JSON. Store in app-local storage (IndexedDB for web/PWA, SQLite for native). Single save slot (only one active game at a time).

### Question Depletion Tracking

The `used_question_ids` set in GameSession prevents question repeats within a single game. For **cross-session** depletion tracking (preventing repeats across multiple games on the same device):

| Field | Type | Description |
|-------|------|-------------|
| seen_questions | Map\<UUID, datetime\> | Question ID → last seen timestamp |
| total_seen | int | Total unique questions seen on this device |

This is stored at the **app level** (not per session) and consulted during question selection. Questions seen recently (within configurable window, e.g. last 5 games) are deprioritized but not excluded.

### Key Algorithms

#### Win Detection

```
function checkWin(board: Board): [int, int][] | null
  for each row:
    if all fields in row are true → return the row fields
  for each column:
    if all fields in column are true → return the column fields
  for main diagonal (top-left to bottom-right):
    if all fields are true → return the diagonal fields
  for anti-diagonal (top-right to bottom-left):
    if all fields are true → return the anti-diagonal fields
  return null
```

Returns the winning line coordinates (for highlighting on the victory screen) or null.

#### 2x Boost Eligibility

```
function isBoostEligible(session: GameSession, playerIndex: int): bool
  if session.round < 3: return false
  playerCorrect = session.players[playerIndex].stats.questions_correct
  minCorrect = min(p.stats.questions_correct for p in session.players)
  return playerCorrect == minCorrect
```

If eligible, 2 of the 4 offered slots are randomly marked with `has_2x_boost = true`. All tied players receive the boost when it is their turn.

#### Previous Round Player Resolution

```
function previousRoundPlayer(session: GameSession): int | null
  if session.round == 1 and session.current_player_index == 0:
    return null  // Very first turn of the game
  prevIndex = (session.current_player_index - 1 + playerCount) % playerCount
  return prevIndex
```

#### Basic Joker Re-Earning

When a player answers a **Slot 1, 2, or 3** question correctly, there is a **low random chance** that they also earn a basic joker (Reshuffle Selection, Reshuffle Question, Reveal Hint, or The Gambler — chosen randomly). This is the only mechanism for re-earning basic jokers.

- The probability is intentionally low (exact value to be tuned during playtesting, starting point ~10-15%).
- The earned joker is added to the player's inventory (count incremented by 1).
- This does **not** apply to Slot 4 (which already awards a special joker), Gambler questions, or pass mechanic answers.
- When a basic joker is earned, a brief notification is shown (e.g. "Earned: Reshuffle Selection!").

---

## 10. Question Selection Algorithm

This section specifies the algorithm for generating the 4 question cards presented to the player each turn.

### Slot 1 — Expertise

The question is drawn from the player's selected expertise categories.

**Category weighting:**
- **60%** chance to draw from one of the player's specific subcategories
- **40%** chance to draw from the broader major category (any subcategory within it)

If the player selected 2 subcategories and 2 major categories, the system first rolls 60/40 to decide subcategory vs. major, then picks uniformly among the selected subcategories or major categories respectively.

**Difficulty distribution:**

| Difficulty | Probability |
|------------|-------------|
| Easy | 35% |
| Medium | 35% |
| Hard | 20% |
| Very Hard | 10% |

**Fallback:** If the player's chosen subcategories are exhausted (all questions used), fall back to the broader major category. If the major category is also exhausted, fall back to any category.

### Slots 2 & 3 — Standard (Random)

- **Category**: Random major category, random subcategory within it. No category diversity enforcement across the 4 cards — the draw is fully random.
- **Difficulty**: Random, uniform distribution across Easy/Medium/Hard/Very Hard.
- **Board constraint**: Each slot reveals either a row or a column (randomly chosen). The constraint must target a row or column that contains at least `placement_candidates` empty fields (or at least 2 empty fields if 2x boost is active on that slot). There is **no fallback** — even if only 1 empty field remains in the constrained row/column, the player's placement is simply forced to that field. This is a deliberate endgame mechanic.
- **Constraint diversity**: Slots 2 and 3 must target **different** rows/columns. If Slot 2 is "Column B", Slot 3 cannot also be "Column B".

### Slot 4 — Hard / Very Hard

- **Category**: Random.
- **Difficulty**: **50/50** split between Hard and Very Hard.
- **Special joker reward**: On correct answer, the game awards a **random** special joker (Duel, Curse, Snipe, or Double Down — chosen uniformly at random). A player can hold **at most 1 of each type**. If they would earn one they already hold, re-roll for a different type. If they hold all 4, no special joker is awarded.

### General Rules

- All 4 slots must offer **different questions** (no duplicate question IDs within a single selection).
- Questions already used in this session (`used_question_ids`) are excluded from all draws.
- Cross-session depletion is consulted but not strictly enforced — recently seen questions are deprioritized but not excluded if the corpus is thin in a given bucket.
- When a curse is active, Slots 1–3 are forced to Hard difficulty. Slot 4 keeps its normal 50/50 Hard/Very Hard (it is already at least Hard by design).
- When 2x boost is active, 2 of the 4 slots are randomly marked with the 2x badge.

---

## 11. Starting Peg Algorithm

When `starting_pegs > 0` in game settings, the game pre-populates each player's board with pegs during SETUP.

### Algorithm

1. Generate a single random pattern of K pegs on the board (where K = `starting_pegs`).
2. **Constraint**: No line (row, column, or diagonal) may have more than 2 starting pegs (`floor(BOARD_SIZE / 2)`). This prevents trivially completable lines from the start.
3. **Identical pattern**: All players receive the **exact same starting pattern** — no rotation or mirroring. Since boards are independently owned and have no inherent asymmetry, identical placement is equally fair and simpler to implement.
4. Apply the pattern to every player's board simultaneously.

### Example

On a 4x4 board with `starting_pegs = 3`, the algorithm generates 3 random positions such that no row, column, or diagonal has more than 2 pegs pre-filled. Every player starts with pegs in the same 3 positions.
