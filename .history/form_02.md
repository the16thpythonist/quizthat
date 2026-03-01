# QuizThat! — Open Design Decisions

The SPEC has grown significantly (state machine, session data model, auto-save are all done), but the expert feedback surfaced several design decisions that still need your input before implementation. These are grouped by topic area.

---

## Technology & Platform

### 1. What technology stack should the game app use?

This cascades into audio handling, asset bundling, animation capabilities, and offline support. The feedback consensus was that React Native or Flutter are the strongest fits (shared codebase, good audio/animation support, offline-capable). A PWA is viable for prototyping but has known audio issues on iOS Safari.

- A) React Native / Expo — large ecosystem, JavaScript/TypeScript, good for UI-heavy apps
- B) Flutter — excellent animation support, Dart, strong cross-platform consistency
- C) Web app (PWA) — universal deployment, but mobile audio is unreliable (Safari autoplay restrictions, background audio)
- D) Native (Swift + Kotlin) — best performance and platform integration, but doubles the codebase

> I will define this later on in a separate file

---

### 2. What audio format should be used for voice lines?

The feedback recommends MP3 at 64 kbps mono for universal compatibility. Opus offers better quality-per-bit but has container format complications on older iOS Safari. This is mostly a "confirm or override" question.

- A) MP3 64 kbps mono (recommended — universal compatibility, adequate for speech, ElevenLabs outputs it natively)
- B) Opus 48 kbps in MP4 container — ~35% smaller files, but more complex pipeline
- C) Decide later based on tech stack choice

> A)

---

## Question Pipeline

### 3. How should multilingual question generation work?

When generating a question in multiple languages, the pipeline can either generate each language independently (truly native phrasing but risk of semantic drift — the "same" question tests different facts) or generate once in a primary language then adapt to others (consistent question identity, slightly less natural phrasing).

- A) Generate-then-adapt (recommended) — research and construct in English first, then have the agent rewrite for other languages using the same facts/answer structure. Not machine translation, but constrained rewriting.
- B) Parallel independent generation — run the full agent pipeline separately per language. Truly native, but expensive (doubles cost) and questions may semantically diverge.
- C) Hybrid — use generate-then-adapt for factual categories (Science, History, Geography), but parallel-independent for language-bound categories (Language, Literature, Pop Culture).

> A) English first

---

### 4. Should audio/listening questions be included in V1?

The automated pipeline can't source audio clips (music snippets, sound effects for identification). This question type needs either manual curation or a licensed audio library integration — neither is trivial.

- A) Defer to V2 (recommended) — ship V1 with multiple choice, sorting, map, and calculation only. Add audio questions later with a dedicated curation workflow.
- B) Include in V1 with manual curation — generate the question text/metadata via the pipeline, but source audio clips manually from royalty-free libraries.
- C) Include in V1 with a hybrid approach — the agent specifies what clip is needed, a human sources it.

> A) Defer to the next version

---

### 5. How should the agent validate question correctness?

The feedback strongly warns against self-validation (the same model that made an error won't catch it). A two-model approach uses a separate validation call to independently verify facts.

- A) Two-model validation (recommended) — generation model produces the question, a separate validation call independently checks each answer option against sources. Flag low-confidence questions for human review.
- B) Self-validation with structured checks — keep single-model but add rigid structured output requirements (cite source per answer, explicit confidence score). Cheaper but less reliable.
- C) Self-validation for now, add second-model later — ship with self-validation, build the infrastructure for two-model validation as a future improvement.

> A) not a separate model but a separate runtime of the same model with a cleared context. Checking at all should be a flag in the command line though and not always active. But if that is activated we query claude code for example again with a checking / validation prompt.

---

### 6. What embedding model should be used for duplicate detection?

The SPEC mentions cosine similarity at >0.85 threshold for duplicate detection, but doesn't specify the embedding model.

- A) OpenAI `text-embedding-3-small` — high quality, cloud API, small per-call cost
- B) Local open-source model (e.g. `all-MiniLM-L6-v2`) — free, no API dependency, requires local inference setup
- C) Anthropic embeddings (if/when available) — keeps the stack on one provider
- D) Skip embedding-based dedup for V1, rely on agent-level awareness + human review

> D)

---

## Game UX

### 7. Should answer audio be split into per-option files?

Currently the spec has a single `answers.{lang}.mp3` per question. The feedback argues this is inflexible — if a player taps an answer mid-narration, the audio must be hard-cut or blocked. Per-option files (`answer_0.en.mp3` ... `answer_3.en.mp3`) allow clean playback control.

- A) Split into per-option files (recommended) — 6 audio files per language per question instead of 3, but clean interruption and per-option replay
- B) Keep single combined file with timestamp metadata — fewer files, but need timing data for seeking
- C) Keep single combined file, accept the tradeoff — simplest pipeline, but awkward playback on skip

> A)

---

### 8. How should the Turn Gate handoff work?

The feedback warns that without a lockout, the previous player may accidentally tap through the Turn Gate during device handoff. Two options were proposed.

- A) Timed lockout (recommended) — ignore taps for 1.5–2 seconds, then fade in "Tap to continue" text
- B) Long-press to continue — require a 500ms hold instead of a tap (harder to accidentally trigger)
- C) Both — lockout period, then require long-press after lockout. Maximum protection but possibly over-engineered.

> for 0.5s locked

---

### 9. How should the Board Viewer overlay behave?

The feedback identified z-index and interaction conflicts when the overlay is available on every screen (especially during question selection where tappable cards are underneath).

- A) Modal overlay (recommended) — dims background to ~60% opacity, blocks all interaction with underlying screen. Toggle via board viewer button.
- B) Semi-transparent overlay — does not block interaction, tap outside to dismiss. Risk of conflicting tap targets.
- C) Full-screen slide-up panel on phone, modal on tablet — different behavior per form factor

> A)

---

### 10. Should phone portrait get adapted layouts?

The feedback identifies several screens that won't fit well on phone portrait (question selection cards, board viewer, player setup). This is a question of scope for V1.

- A) Yes, design phone-specific adaptations from the start — carousel for question cards, horizontal scroll for boards, bottom sheets for setup
- B) Tablet-first, phone gets the same layout scaled down — simpler, but cramped on phone
- C) Tablet-only for V1 — explicitly target tablets, defer phone optimization to V2

> B)

---

## Internationalization

### 11. Should joker names be translated or kept as English proper nouns?

"Steal", "Curse", "Snipe", "The Gambler", "Double Down" etc. These are brand-like game terms. Both approaches are valid — translated names are more accessible to non-English speakers; English names are more recognizable across languages and avoid awkward translations.

- A) Translate them — "Stehlen", "Fluch", "Scharfschuss", "Der Spieler", etc. More accessible for German-only speakers.
- B) Keep English as proper nouns — treat them like game-specific brand names (similar to how "Uno" or "Monopoly" aren't translated). Easier to maintain.
- C) Hybrid — translate the basic jokers (they're generic actions), keep special joker names in English (they're more "branded")

> C)

---

### 12. How should the narrator refer to players — by color or by name?

The spec says players pick colors and optionally enter names. Pre-generated voice lines can only say "Player Red, your turn" (colors are known in advance). Using actual player names would require runtime TTS or generating name-specific audio during game setup.

- A) Always use colors (recommended for V1) — narrator says "Player Red" while the UI shows custom names. Accept the minor disconnect.
- B) Generate name-specific lines during setup — when players enter names, call ElevenLabs to create personalized lines (~30 seconds, needs internet). Premium touch but adds API dependency at game start.
- C) Use colors for narration, names for UI text only — no disconnect because the narrator is clearly color-based by design

> A)

---

### 13. Should per-language difficulty overrides be supported?

A "medium" question about the NFL is trivial for Americans but expert-level for Germans. The feedback suggests allowing `question.{lang}.json` to override the base difficulty from `meta.json`.

- A) Yes, support per-language difficulty overrides from the start — `difficulty_override` field in `question.{lang}.json`. The game uses the per-language difficulty when filtering/displaying.
- B) No overrides — one difficulty per question globally. Mitigate bias by preferring cross-culturally relevant topics during generation.
- C) Add later based on playtesting data — generate with a single difficulty for now, add overrides when real player data shows where the mismatches are.

> B)

---

## Game Mechanics (Remaining Gaps)

### 14. How should Slot 4's special joker reward be determined?

When a player correctly answers a Slot 4 (Hard/Very Hard) question, they earn a special joker (Steal, Curse, Snipe, or Double Down). But which one?

- A) Random — the game randomly picks one of the 4 special jokers
- B) Player's choice — after answering correctly, the player picks which special joker to receive
- C) Rotating / balanced — the game cycles through the 4 types to ensure variety
- D) Shown on the card — the specific joker is revealed on the Slot 4 card during question selection, so the player knows the reward before choosing

> A) 

---

### 15. How are basic jokers (Reshuffle Selection, Reshuffle Question, Reveal Hint, The Gambler) re-earned?

The IDEA says "spent jokers can be re-earned through gameplay" but only defines Slot 4 as a source for *special* jokers. There's no defined mechanism for re-earning basic jokers.

- A) Answering streaks — earn a random basic joker after N correct answers in a row (e.g., 3)
- B) Round milestones — earn a basic joker at the start of every Nth round (e.g., every 3rd round)
- C) Slot 4 rewards include basics too — Slot 4 can award either a special OR a basic joker (expands the reward pool)
- D) No re-earning for V1 — basic jokers are truly one-time. Simplifies the system. Add re-earning later.
- E) Another idea?

> Randomly with a very low chance one of the first three questions may also give the possibility to re-earn a basic joker when answering correctly.

---

### 16. How should starting peg placement work across players?

The IDEA says boards can be pre-populated with pegs, and "all players receive the same pattern, mirrored or rotated." The feedback argues that since boards have no inherent asymmetry, rotation is irrelevant — just give everyone the identical pattern.

- A) Identical pattern for all players (recommended) — simpler, equally fair since boards are symmetric. Add constraint: no line may have more than `floor(board_size / 2)` starting pegs.
- B) Rotated/mirrored pattern — each player gets a transformation of the base pattern (4 rotations + 4 reflections). More variety but adds complexity.
- C) Fully random per player — each player gets independently random starting pegs (same count). Simplest but might give positional advantages.

> A)

---

### 17. What question selection algorithm rules should apply?

Several sub-questions about how the 4 question cards are generated each turn. The SPEC doesn't specify these details.

**Expertise weighting (Slot 1):** What probability split between major categories and specific subcategories?
- Proposed default: 60% specific subcategory, 40% broader major category

**Slot 1 difficulty distribution:** The table says "Any" — should this be uniform random across Easy/Medium/Hard/Very Hard, or weighted?
- Proposed default: weighted toward Easy/Medium (e.g., 35% Easy, 35% Medium, 20% Hard, 10% Very Hard)

**Category diversity:** Should the 4 cards avoid repeating categories?
- Proposed default: no, completely random

**Slot 4 difficulty split:** Hard vs Very Hard — what ratio?
- Proposed default: 50/50

**Constraint selection (Slots 2/3):** Should both slots be allowed to have the same row/column constraint?
- Proposed default: no, they should target different rows/columns

> sounds good, lets go with these defaults

---

