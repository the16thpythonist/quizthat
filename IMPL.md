# QuizThat! — Implementation Guide

This document describes the current codebase: how the pieces fit together, where to find each piece of functionality, and the key APIs. For game design see [IDEA.md](./IDEA.md), for specifications see [SPEC.md](./SPEC.md), for technology choices see [TECH.md](./TECH.md).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Flow](#2-data-flow)
3. [Frontend — Engine](#3-frontend--engine)
4. [Frontend — State Management](#4-frontend--state-management)
5. [Frontend — Screens](#5-frontend--screens)
6. [Frontend — Components](#6-frontend--components)
7. [Frontend — Audio](#7-frontend--audio)
8. [Frontend — Internationalization](#8-frontend--internationalization)
9. [Pipeline — CLI](#9-pipeline--cli)
10. [Pipeline — Agent Backend](#10-pipeline--agent-backend)
11. [Pipeline — TTS & Validation](#11-pipeline--tts--validation)
12. [Pipeline — Configuration](#12-pipeline--configuration)
13. [Corpus](#13-corpus)
14. [Infrastructure](#14-infrastructure)
15. [Testing](#15-testing)

---

## 1. Architecture Overview

The project has two independent systems that share a single data format (the question corpus):

```
┌─────────────────────────────────────────────────────────────┐
│                      Game Application                       │
│                                                             │
│  Vue 3 + Pinia + TypeScript                                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌─────────────┐  │
│  │  Engine   │  │  Stores  │  │ Screens │  │   Audio     │  │
│  │ state     │──│ game.ts  │──│ 11 .vue │  │ Howler.js   │  │
│  │ machine,  │  │ persist  │  │ files   │  │ voice queue │  │
│  │ algorithms│  └──────────┘  └─────────┘  └─────────────┘  │
│  └──────────┘                                               │
│       ▲ reads corpus-index.json + lazy-loads question files  │
├───────┼─────────────────────────────────────────────────────┤
│       │              questions/ directory                    │
├───────┼─────────────────────────────────────────────────────┤
│       │         Question Generation Pipeline                │
│  ┌────┴─────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ CLI      │  │  Agent   │  │   TTS    │  │  Corpus    │  │
│  │ rich-    │──│  Claude  │──│  Eleven  │  │  stats,    │  │
│  │ click    │  │  Agent   │  │  Labs    │  │  gaps,     │  │
│  │          │  │  SDK     │  │  (stub)  │  │  validate  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**No runtime server.** The game app is a pure client-side SPA. The corpus is served as static files (Nginx in production, separate container in dev). The pipeline is an offline CLI tool that produces the corpus.

**No Vue Router.** The Pinia game store holds the current `GameState` enum value. `App.vue` maps states to screen components via `screenForState()`. Navigating means changing the state — there are no URLs, no back button, no route guards.

---

## 2. Data Flow

### Game Loop

```
User taps "New Game"
  → SetupScreen dispatches game.startGame()
    → store sets state = 'turn_start', initializes boards
      → App.vue renders TurnGateScreen (via screenForState)
        → user taps → store.proceedFromTurnGate()
          → state = 'selection'
            → SelectionScreen shows 4 slots
              → user taps slot → store.selectSlot(i)
                → state = 'question_display'
                  → QuestionScreen shows question
                    → user submits → store.submitAnswer()
                      → state = 'answer_correct' or 'answer_wrong'
                        → correct path → PegPlacementScreen → WIN_CHECK → next turn or VICTORY
                        → wrong path → PassGateScreen (round ≥ 2) or TURN_END
```

Every user action calls a store method. The store method validates the transition, mutates state, and the reactive `screenForState()` computed property causes `App.vue` to swap the rendered component.

### Auto-Save

```
store mutation → structuredClone(session) → debounce 500ms → IndexedDB write
                                          → immediate flush on visibilitychange/pagehide
```

### Corpus Loading

```
App startup → fetch corpus-index.json → filter by language → store question metadata
Question needed → fetch questions/{id}/question.{lang}.json → parse → display
Audio needed → fetch questions/{id}/audio/{file}.{lang}.mp3 → Howler.js playback
```

---

## 3. Frontend — Engine

The engine is pure logic — no Vue dependencies, no DOM access. All functions are deterministic when given the seeded RNG.

### `frontend/src/engine/rng.ts`

Seedable PRNG wrapper around the `seedrandom` npm package. Every random decision in the game must use this — never `Math.random()`.

| Method | Description |
|--------|-------------|
| `next()` | Float in [0, 1) |
| `int(min, max)` | Integer in [min, max] inclusive |
| `pick(arr)` | Random element from array |
| `shuffle(arr)` | Fisher-Yates in-place shuffle, returns same array |
| `sample(arr, n)` | N unique random elements |
| `chance(p)` | Returns true with probability p |
| `weightedPick(items, weights)` | Weighted random selection |

### `frontend/src/engine/algorithms.ts`

All core game logic. 583 lines. Key exports:

**Win Detection:**
- `checkWin(board)` — checks all rows, columns, both diagonals. Returns winning coordinates or null.

**Peg Placement:**
- `getEmptyFields(board)` — all empty [row, col] positions
- `getConstrainedEmptyFields(board, constraint)` — empty fields within a row or column
- `generateCandidates(board, rule, rng)` — N random candidates per placement rule
- `calculatePegCount(has2xBoost, doubleDown)` — additive: base 1 + 2x +1 + DD +1, max 3
- `generateStartingPegs(boardSize, count, rng)` — random positions, no line > floor(N/2) filled
- `applyStartingPegs(players, pegs)` — apply identical pattern to all players

**Question Selection:**
- `pickSlot1Difficulty(rng)` — weighted: 35% easy, 35% medium, 20% hard, 10% very hard
- `pickUniformDifficulty(rng)` — uniform across all 4 difficulties
- `pickSlot4Difficulty(rng)` — 50/50 hard / very hard
- `generateConstraint(board, rng, exclude?)` — random row/column with ≥1 empty field
- `filterQuestions(corpus, filters)` — filter by language, difficulty, category, exclusions
- `generateSlots(session, corpus, rng)` — produces 4 OfferedSlot objects for a turn

**Joker Mechanics:**
- `rollBasicJokerReEarn(rng)` — ~12% chance, returns random basic joker type or null
- `awardSpecialJoker(inventory, rng)` — random special joker, capped at 1 per type, re-rolls on duplicate
- `scrambleAnswerOrder(options, rng)` — shuffled indices for pass mechanic

**Utilities:**
- `placementRuleForSlot(slotIndex, slot, settings)` — derives PlacementRule from slot type
- `boardSizeToNumber(size)` / `createEmptyBoard(size)` / `columnLabel(i)` / `rowLabel(i)`
- `isBoostEligible(session, playerIndex)` — round ≥ 3 and fewest questions_correct
- `assignBoostSlots(slots, rng)` — marks 2 random slots with 2x badge

### `frontend/src/engine/stateMachine.ts`

Transition validation. Two lookup tables:

- `VALID_TRANSITIONS` — maps each GameState to its valid next states
- `isValidTransition(from, to)` — boolean check
- `isJokerLegalInState(state, jokerType)` — jokers are only legal in `selection` and `question_display`
- `getLegalJokers(state)` — returns list of legal joker types for a state

### `frontend/src/engine/screenMap.ts`

Maps GameState enum values to Vue screen components using `defineAsyncComponent` for code-splitting:

```typescript
screenForState(state: GameState): Component
```

Multiple states can map to the same component (e.g., `gambler_question` and `pass_answering` both use `QuestionScreen.vue`).

### `frontend/src/types/session.ts`

All TypeScript type definitions for the game. 259 lines. Key types:

**Enums/Unions:**
- `GameState` — 18 states: `setup`, `turn_start`, `selection`, `gambler_confirm`, `gambler_question`, `gambler_resolve`, `question_display`, `answer_correct`, `answer_wrong`, `pass_gate`, `pass_answering`, `pass_resolve`, `peg_placement`, `win_check`, `victory`, `turn_end`
- `BoardSize` — `'3x3' | '4x4' | '5x5'`
- `Difficulty` — `'easy' | 'medium' | 'hard' | 'very_hard'`
- `PlayerColor` — `'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'`
- `QuestionType` — `'multiple_choice' | 'sorting' | 'map_location' | 'calculation'`
- `SlotType` — `'expertise' | 'standard' | 'hard'`
- `JokerType` — 8 types (4 basic + 4 special)

**Core Interfaces:**
- `GameSession` — top-level container with settings, players, turn state, history
- `Player` — name, color, expertise, board, jokers, stats, is_cursed
- `Board` — size + `fields: boolean[][]` + peg_count
- `JokerInventory` — count per joker type
- `TurnState` — transient per-turn state (offered slots, selected question, placement, pass sub-state)
- `OfferedSlot` — slot_type, question_id, teaser, category, difficulty, constraint, has_2x_boost
- `PlacementRule` — type (random_board / constrained / free) + constraint + candidates_count
- `PassState` — pass_player_index, scrambled_order, result

**Answer Data (polymorphic by question type):**
- `MultipleChoiceAnswerData` — `options: string[]`, `correct_index: number`
- `SortingAnswerData` — `items: string[]`, `correct_order: number[]`, `metric: string`
- `MapLocationAnswerData` — `target: {lat, lng}`, `scoring: {radius_km, label}[]`
- `CalculationAnswerData` — `correct_value: number`, `tolerance: number`, `unit: string`

**Constants:**
- `PLAYER_COLORS` — ordered array of 6 colors
- `COLOR_HEX` / `COLOR_BG` / `COLOR_BG_DARK` — hex values per color for UI rendering

---

## 4. Frontend — State Management

### `frontend/src/stores/game.ts`

The central Pinia store. 403 lines. All game state lives here. Screens read from it and dispatch actions — never mutate state directly.

**State:**
- `state`, `sessionId`, `status`, `players`, `currentPlayerIndex`, `round`, `turn`, `settings`, `currentQuestion`, `setupPhase`, `winnerPlayerIndex`, `winningLine`, `usedQuestionIds`

**Computed:**
- `currentPlayer` — active player object
- `isCorrect` — whether current state is `answer_correct`

**Setup Actions:**
- `goToPlayerSetup()` / `goToStart()` — toggle setup phase
- `addPlayer(name, color)` / `removePlayer(index)` — manage player list
- `updateSettings(partial)` — update board size, placement candidates, starting pegs
- `getAvailableColors()` — colors not yet assigned to players

**Game Flow Actions:**
- `startGame()` — initialize session, boards, state → `turn_start`
- `proceedFromTurnGate()` — state → `selection`
- `setOfferedSlots(slots)` — populate the 4 question cards
- `selectSlot(index)` — pick a slot, state → `question_display`
- `setQuestionData(data)` — load question content for display
- `submitAnswer(answerIndex)` — evaluate answer, state → `answer_correct` or `answer_wrong`
- `proceedToPlacement()` — state → `peg_placement`, calculate pegs_remaining
- `proceedFromWrongAnswer()` — state → `pass_gate` (round ≥ 2) or `turn_end`
- `placePeg(row, col)` — place peg, check win, handle multi-peg sequences
- `resetGame()` — back to setup

**Pass Actions:**
- `proceedFromPassGate()` — state → `pass_answering`
- `submitPassAnswer(answerIndex)` — evaluate pass answer
- `proceedFromPassResolve()` — award peg or advance to turn_end

**Joker Actions:**
- `useJoker(type)` — consume joker, add to jokers_used_this_turn set
- `revealHint()` — set hint_revealed flag
- `activateDoubleDown()` — set double_down_active flag
- `applyCurse(index)` — mark an opponent; spent when their turn begins
- `snipePeg(index, row, col)` — remove one chosen peg
- `startDuel(index)` — challenge one opponent (see Battles below)

**Battles and Duels:**

Both run on the same `BattleState` and the same four screens
(`battle_intro` → `battle_gate` → `battle_answering` → `battle_reveal`), which
is why the Duel joker needed almost no new machinery.

- `_startBattle()` closes every full round: all players in turn order answer one
  `estimation` or `battle_map` question blind, and last place gives one random
  peg to first place **on the same coordinates**. Returns `false` — and play
  simply carries on — when there are no battle questions left.
- `startDuel(index)` is the Duel joker: `challenger_index` is set, `order` is
  exactly `[challenger, opponent]`, and `_resolveBattle` moves a peg **only if
  the challenger wins**. Losing costs nothing but the joker. Afterwards
  `proceedFromBattleReveal` returns to `selection` rather than opening the next
  turn — a duel is an interlude inside the challenger's own turn.
- `_pickBattleQuestion()` is the shared draw (battle-only questions, excluding
  used ids).

### `frontend/src/stores/persistence.ts`

IndexedDB persistence layer using the `idb` npm package. 183 lines.

**Database:** `quizthat-db` with two object stores: `sessions`, `seen_questions`

**Session Persistence:**
- `saveSession(session)` — serialize (Sets → Arrays) and write to IndexedDB
- `loadSession()` — read and deserialize (Arrays → Sets)
- `deleteSession()` — remove saved session
- `scheduleAutoSave(session)` — debounced 500ms trailing write
- `flushAutoSave()` — immediate write (called on visibilitychange/pagehide)

**Cross-Session Question Tracking:**
- `recordSeenQuestion(questionId)` — track question seen with timestamp
- `getSeenQuestions()` — Map<UUID, datetime> of all seen questions

**Lifecycle:**
- `setupAutoSaveListeners()` — registers visibilitychange + pagehide handlers for immediate flush

---

## 5. Frontend — Screens

All screens are in `frontend/src/screens/`. Each is a Vue 3 SFC with `<script setup lang="ts">`. Screens are rendered by `App.vue` via `<component :is="screenForState(game.state)">`.

| Screen | File | Game States | Purpose |
|--------|------|-------------|---------|
| Setup | `SetupScreen.vue` | `setup` | Start menu + player/settings configuration. Two phases: start screen (New Game button) and player setup (add players, pick colors, configure board). Min 2 players to start. |
| Turn Gate | `TurnGateScreen.vue` | `turn_start` | Full-screen handoff overlay in player's color. 500ms tap lockout prevents accidental tap-through. "Tap to continue" fades in after lockout. |
| Selection | `SelectionScreen.vue` | `selection` | 4 vertical question cards with teaser, category, difficulty stars, slot styling (bronze/silver/gold borders), constraint labels, 2x badges. JokerTray at bottom. |
| Question | `QuestionScreen.vue` | `question_display`, `gambler_question`, `pass_answering` | Multi-type question display. Multiple choice: 4 tappable buttons. Sorting: tap-to-swap reordering. Calculation: custom numeric keypad. Map: placeholder for Leaflet. Soft time limit with background color shift. Hint display, Double Down indicator. During pass: shows Decline button, hides JokerTray. |
| Answer Result | `AnswerResultScreen.vue` | `answer_correct`, `answer_wrong` | Green checkmark (correct) or red X (incorrect). Tap to proceed. |
| Peg Placement | `PegPlacementScreen.vue` | `peg_placement` | Interactive board via BoardGrid. Candidate fields pulse/glow. Tap to place. Pegs remaining counter for multi-peg. Free placement shows all empty fields. |
| Victory | `VictoryScreen.vue` | `victory` | Winner announcement with color circle, confetti (40 CSS particles), board with winning line highlighted. Play Again / Back to Menu. |
| Pass Gate | `PassGateScreen.vue` | `pass_gate` | Mini turn gate for the pass player. Same 500ms lockout pattern. |
| Pass Resolve | `PassResolveScreen.vue` | `pass_resolve` | Shows correct answer after pass declines. Tap to continue. |
| Gambler Confirm | `GamblerConfirmScreen.vue` | `gambler_confirm` | Stub — "coming soon" placeholder. |
| Gambler Resolve | `GamblerResolveScreen.vue` | `gambler_resolve` | Stub — "coming soon" placeholder. |
| Battle Intro | `BattleIntroScreen.vue` | `battle_intro` | Announces the round battle, or names both players for a Duel and states that only the challenger can lose. |
| Battle Gate | `BattleGateScreen.vue` | `battle_gate` | Handoff between battle answers — the reason nobody profits from going last. |
| Battle Answer | `BattleAnswerScreen.vue` | `battle_answering` | Keypad for estimation, blind Leaflet pin for `battle_map`. No feedback of any kind. |
| Battle Reveal | `BattleRevealScreen.vue` | `battle_reveal` | The true answer, every guess with its deviation, and — for map battles — `BattleResultMap`. The peg transfer is drawn on both boards. |

---

## 6. Frontend — Components

Reusable components in `frontend/src/components/`:

### `BoardGrid.vue`

N×N grid with column labels (A, B, C...) and row labels (1, 2, 3...).

| Prop | Type | Description |
|------|------|-------------|
| `board` | `Board` | Board state (size + fields) |
| `playerColor` | `PlayerColor` | Color for pegs and tints |
| `winningLine?` | `[number, number][]` | Positions to highlight with yellow rings |
| `candidateFields?` | `[number, number][]` | Valid placement positions (pulse animation) |
| `interactive?` | `boolean` | Whether clicks emit events |

Emits `fieldClick(row, col)` when an interactive candidate field is tapped.

### `JokerTray.vue`

Horizontal bar showing all 8 joker types with emoji icons and availability state.

| Prop | Type | Description |
|------|------|-------------|
| `jokers` | `JokerInventory` | Current counts |
| `usedThisTurn` | `Set<JokerType>` | Already-used types this turn |
| `gameState` | `GameState` | Determines which jokers are usable |

Emits `useJoker(type)`. Jokers with count 0 or already used show reduced opacity. Only jokers legal in the current state are clickable.

### `BoardViewerOverlay.vue`

Modal overlay accessible via a persistent "Boards" button in the top-right corner (visible when game status is `in_progress`). Shows all player boards in a grid layout. Tap a board to zoom in. Does not pause the game.

---

## 7. Frontend — Audio

### `frontend/src/audio/audioManager.ts`

Singleton `audioManager` wrapping Howler.js. 294 lines.

**Voice Line Queue:**
- `enqueueVoice(src)` — add a voice line to the sequential queue
- `enqueueMultiple(srcs)` — add multiple lines
- `enqueueQuestionAudio(questionId, lang, optionCount)` — queue teaser + question + all answer options
- `skipCurrent()` — skip current line with 200ms fade-out
- `clearQueue()` — stop and clear all queued lines
- Lines play sequentially with 200ms gaps between them

**Background Music:**
- `startMusic(src, { fadeInMs })` — start the looping track. `src` may be a list of
  sources in preference order (ogg, then mp3); formats are derived from the file
  extensions. Idempotent: calling it with the track already playing is a no-op, so
  it can be re-fired on every state transition. Returns a promise that resolves
  once playback has *actually* begun — see autoplay below.
- `stopMusic()` — fade out and stop
- Automatic ducking: music volume drops to 15% during voice playback, restores after

**Autoplay unlock:**
- `whenAudible()` — resolves once the browser permits playback: immediately if the
  AudioContext is already running, otherwise on the first `pointerdown`/`touchstart`/
  `keydown`. Browsers *queue* a `play()` issued against a suspended context rather
  than refusing it, so anything timed against playback (a fade, a line scheduled
  after one) would otherwise elapse silently before the user hears anything.
  Howler creates its AudioContext lazily on the first `Howl`, so this reports
  "audible" when no context exists yet — call it after some audio is constructed.

**Sound Effects:**
- `playSfx(src)` — one-shot playback, cached by path. A source that fails to load is
  recorded as unavailable and skipped from then on, so the SFX slots with no file yet
  stay silent instead of throwing every turn.

**Settings:**
- `updateSettings(settings)` — master volume, music volume, mute, music enabled, sfx enabled
- `getSettings()` — current audio settings

### `frontend/src/audio/sfx.ts`

Asset paths, served from `public/` (not bundled).

- `SFX` — the nine effect slots (all `/sfx/*.mp3`): `CORRECT`, `INCORRECT`, `PEG_DROP`,
  `ROULETTE_TICK`, `VICTORY_FANFARE`, `HEARTBEAT`, `JOKER_USE`, `CARD_SELECT`,
  `BUTTON_TAP`. Only `INCORRECT` has a file so far; the rest are silent no-ops.
- `MUSIC.GAMEPLAY_LOOP` — `['/music/quizshow_loop.ogg', '/music/quizshow_loop.mp3']`.
  **Ogg first, deliberately:** MP3 cannot loop gaplessly because the format pads every
  file with encoder delay (~32 ms here), audible as a hiccup on every wrap. The MP3 is
  a fallback for browsers without Vorbis (Safari); Howler picks the first playable one.
- `VOICE` — UI narrator lines as `{lang}` templates, resolved by `voiceLine(tpl, lang)`
  against the active i18n locale. Adding a language means dropping
  `welcome.<lang>.mp3` into `public/voice/` — no code change. A missing file is silent:
  the voice queue skips entries that fail to load. Currently German only.
- `MUSIC_FADE_IN_MS` — title-screen fade duration (3000).

### Opening sequence (`App.vue`)

Once per page load: music fades up over `MUSIC_FADE_IN_MS`, then the welcome voice line
plays (ducking the music automatically). Sequenced off the promise from `startMusic()`
rather than a bare timer, so a blocked autoplay delays the whole sequence to the user's
first tap instead of running it against silence. The welcome is skipped if the player
has already left the title screen during the fade.

Music start/stop is driven by a `watch` on `game.state` in `App.vue`, not from a
screen's `onMounted` — screens mount and unmount on every transition and the music has
to survive that. It stops on `victory`.

---

## 8. Frontend — Internationalization

**Setup:** `vue-i18n` configured in `main.ts` with auto-detection of browser language (German if `navigator.language` starts with `de`, else English).

**String Files:** `frontend/src/i18n/en.json` and `de.json` (156 lines each).

**Key namespaces:** `start.*`, `setup.*`, `colors.*`, `turnGate.*`, `selection.*`, `question.*`, `answer.*`, `passGate.*`, `passResolve.*`, `board.*`, `victory.*`, `jokerNames.*`, `difficulty.*`, `categories.*`, `settings.*`, `gambler.*`, `narrator.*`

**Convention:** Screens use `$t('namespace.key')` or `$t('key', { name: value })` for interpolation. Special jokers (Duel, Curse, Snipe, Double Down) are English proper nouns in all languages per SPEC — except Duel, which reads as "Duell" in German.

---

## 9. Pipeline — CLI

Entry point: `pipeline/quizthat/cli.py`. Installed as `quizthat` command via pyproject.toml.

### Commands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `quizthat generate "prompt"` | Generate a single question | `--category`, `--subcategory`, `--difficulty`, `--type`, `--languages`, `--validate`, `--model` |
| `quizthat generate-batch` | Bulk generation | `--category`, `--subcategory`, `--difficulty`, `--type`, `--count`, `--languages`, `--dry-run` |
| `quizthat corpus stats` | Show corpus statistics | — |
| `quizthat corpus gaps` | Show underpopulated buckets | `--languages`, `--json` |
| `quizthat corpus validate` | Validate all question folders | — |

### `generate.py` — Single Generation

Uses `StageTracker` class for multi-stage Rich Live display (spinner → checkmark per stage). Stages: Research → Construct → Validate (optional) → TTS → Done. Falls back gracefully if Claude Agent SDK is not installed.

### `batch.py` — Batch Generation

Generates batch ID (`batch-YYYY-MM-DD-HHMMSS`). Rich Progress bar with spinner. Tracks generated/failed/duplicate counts. `--dry-run` previews what would be generated without invoking the agent.

### `corpus.py` — Corpus Management

- `load_all_meta()` — scans `questions/*/meta.json`
- `corpus_stats()` — Rich tables showing counts by category, difficulty, type, language
- `corpus_gaps()` — identifies buckets with < 3 questions. `--json` flag for machine-readable output.

### `schemas.py` — Pydantic Schemas

Mirrors the SPEC.md data format. Key models:

- `QuestionMeta` — meta.json schema (id, languages, category, difficulty, type, etc.)
- `QuestionContent` — question.{lang}.json schema (teaser, question_text, hint, answer_data)
- `MultipleChoiceAnswerData`, `SortingAnswerData`, `MapLocationAnswerData`, `CalculationAnswerData`
- `CorpusIndex` / `CorpusIndexEntry` — corpus-index.json schema

---

## 10. Pipeline — Agent Backend

### `pipeline/quizthat/agent/runner.py`

Async functions that invoke Claude Code via the Claude Agent SDK:

- `generate_question_with_agent(prompt, options)` — runs an agent with custom MCP tools to research and write a question. Default model: `claude-sonnet-4-20250514`, max 20 turns, permission mode `acceptEdits`.
- `validate_question_with_agent(question_path)` — separate agent run with fresh context to verify factual correctness. Max 10 turns.

### `pipeline/quizthat/agent/tools.py`

Custom MCP tools registered with `@tool` decorator:

- `write_question` — creates a question folder with `meta.json`, `question.{lang}.json` per language, `generation/research.md`, and `generation/log.json`. Validates data via Pydantic schemas before writing.
- `check_corpus` — scans existing corpus for questions in the same category. Returns list of existing question teasers/texts for duplicate avoidance.

Helper: `get_questions_dir()` — reads `QUIZTHAT_QUESTIONS_DIR` env var or defaults to `questions/`.

### `pipeline/quizthat/agent/prompts.py`

Two system prompts:

- `GENERATION_SYSTEM_PROMPT` — instructs the agent to research via web search, construct factual questions in all 4 types, write both English and German versions, use check_corpus before writing.
- `VALIDATION_SYSTEM_PROMPT` — instructs a separate agent to independently verify factual accuracy, distractor validity. Outputs verdict (pass/flag/reject) with confidence.

---

## 11. Pipeline — TTS & Validation

### `pipeline/quizthat/tts/client.py`

**Currently stubbed.** No ElevenLabs API key available.

- `load_voice_config()` — reads `config/voices.yaml`
- `generate_voice_lines(question_dir, lang)` — for each question, would generate: `teaser.{lang}.mp3`, `question.{lang}.mp3`, `answer_{i}.{lang}.mp3`. Currently creates empty placeholder files and logs what would be sent to ElevenLabs.
- `generate_all_voice_lines(question_dir)` — generates for all languages listed in meta.json

### `pipeline/quizthat/validation/validator.py`

Structural validation (not AI-based):

- `validate_question_folder(path)` — checks meta.json exists, all listed languages have question files, answer_data matches question_type schema. Returns list of error strings.
- `validate_corpus(questions_dir)` — runs validation on all question folders. Returns dict of question_id → errors (only includes invalid entries).

---

## 12. Pipeline — Configuration

### `pipeline/config/categories.yaml`

13 major categories with 3–5 subcategories each:

Science, History, Geography, Arts & Culture, Sports, Technology, Nature, Pop Culture, Food & Drink, Language & Words, Politics, Math & Logic, Mythology

### `pipeline/config/voices.yaml`

ElevenLabs narrator config per language (en, de). Each specifies voice_id, model_id (`eleven_multilingual_v2`), stability/similarity/style settings, output format (`mp3_44100_64`).

---

## 13. Corpus

### Location

`questions/` directory at project root. Not part of the Vite build — served separately.

### Structure

```
questions/
  corpus-index.json        ← generated by scripts/build-corpus-index
  {question-id}/
    meta.json              ← category, difficulty, type, languages, time_limit
    question.en.json       ← teaser_title, question_text, hint, answer_data
    question.de.json
    audio/                 ← voice line MP3s (placeholder/empty for now)
    generation/
      research.md          ← agent's research notes
      log.json             ← generation metadata (model, timestamp, batch)
```

### `corpus-index.json`

Generated by `scripts/build-corpus-index` (Python script). Scans all `meta.json` files and produces:

```json
{
  "generated_at": "...",
  "question_count": 18,
  "questions": [
    { "id": "...", "major_category": "...", "subcategory": "...", "difficulty": "...", "question_type": "...", "languages": ["en", "de"], "path": "..." }
  ]
}
```

The frontend loads this at startup, filters by language, and lazy-loads individual question files on demand.

### Current Corpus

18 test questions: 10 multiple choice, 3 sorting, 3 map location, 2 calculation. All bilingual (en + de). Mix of easy/medium/hard across multiple categories.

---

## 14. Infrastructure

### `docker-compose.yml`

Two services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `frontend` | Built from `frontend/Dockerfile` | 5173 | Vite dev server (Vue app only) |
| `corpus` | `nginx:alpine` | 8080 | Static file server for `questions/` directory |

### `frontend/Dockerfile`

Node 22 Alpine, `npm ci`, exposes 5173, runs `npm run dev -- --host 0.0.0.0`.

### `frontend/vite.config.ts`

Vue plugin + Tailwind CSS plugin. Path alias `@` → `src/`. Dev server on `0.0.0.0:5173`.

### `frontend/package.json`

Scripts: `dev`, `build` (vue-tsc + vite build), `preview`, `test` (vitest).

Key runtime dependencies: vue 3.5, pinia 3.0, vue-i18n, tailwindcss 4.2, gsap, howler, leaflet, sortablejs, seedrandom, idb.

### `.gitignore`

Ignores: node_modules, dist, .venv, IDE files, .env files, `questions/corpus-index.json` (generated).

---

## 15. Testing

### Frontend

**Framework:** Vitest with jsdom environment and `@vue/test-utils`.

**Config:** `frontend/vitest.config.ts` — globals enabled, jsdom environment.

**Tests:** `frontend/src/engine/__tests__/algorithms.test.ts` — 42 unit tests covering:
- Win detection (rows, columns, diagonals, no win)
- Empty field enumeration
- Peg count calculation
- Boost eligibility
- Starting peg generation constraints
- Difficulty distribution
- Board utilities

Run: `cd frontend && npm test`

### Pipeline

**Framework:** pytest (configured in pyproject.toml as optional dev dependency).

No tests written yet.
