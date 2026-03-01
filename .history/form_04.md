# Pre-Implementation Open Questions

After a final pass of IDEA.md, SPEC.md, and TECH.md, these are the remaining questions that need answers before implementation can start. They're grouped by how urgently they block the work.

---

## Game Mechanics — Blocking

### 1. Should Map Location be in V1 scope?

The SPEC lists Map Location as a V1 question type, but it requires a map rendering library (Leaflet or MapLibre), touch-friendly pan/zoom, and — critically — offline map tiles (~50 MB for world zoom 2-6). This is a significant chunk of work and bundle size for one question type.

- A) Keep in V1 — add Leaflet + bundled tile set. Accept the complexity and size.
- B) Defer to V2 — remove from V1 scope, update the SPEC. Ship V1 with multiple choice, sorting, and calculation only.
- C) V1 but online-only — include it but require network for map tiles (no offline tile bundling). Degrade gracefully if offline.

> A)

---

### 2. How should Sorting questions work on touch devices?

The SPEC says "drag-and-drop list with large pill-shaped items. Support tap-to-swap as an alternative." Native HTML5 drag-and-drop doesn't work on mobile/WebView. Two approaches:

- A) Tap-to-swap only for V1 — simpler, more reliable on all devices. Player taps item A, then taps item B to swap positions. No drag library needed.
- B) SortableJS (drag-and-drop) + tap-to-swap fallback — richer interaction but adds a dependency and needs touch testing on Android WebView.

> B)

---

### 3. How many items do Sorting questions have?

The SPEC shows 4 items in the example but doesn't formalize the count.

- A) Always 4 items — consistent with multiple choice (4 options), simpler UI
- B) Variable (3-6) — more variety, stored in `answer_data.items[]`. UI must handle varying list lengths.

> A)

---

### 4. What does the Calculation question keypad support?

The SPEC says "custom numeric keypad embedded in the screen" but doesn't specify what keys are available.

- A) Integers only — digits 0-9, backspace, negative sign, submit. Simplest.
- B) Decimals — add a decimal point key. Covers most science/math questions.
- C) Full scientific — decimals + negative + comma separator. For more complex questions.

> C)

---

### 5. Does the Curse joker force exactly "Hard" or "Hard-or-higher"?

The SPEC says "all 4 slots are forced to Hard difficulty." But Slot 4 is normally Hard/Very Hard.

- A) Exactly Hard — all slots become Hard, including Slot 4 (which downgrades from its normal 50/50 Hard/Very Hard). Simpler.
- B) At least Hard — Slots 1-3 become Hard, Slot 4 keeps its normal 50/50 Hard/Very Hard. More interesting for Slot 4.

> B)

---

### 6. Can the 2x boost badge land on any of the 4 slots?

The SPEC says "2 of their 4 question options are randomly marked with 2x." But Slot 1 (expertise, whole-board placement) and Slot 4 (free placement + special joker) already have their own reward structures. Should 2x be restricted?

- A) Any slot — 2x can land on any of the 4 slots, including Slot 1 and Slot 4. Simpler logic.
- B) Only Slots 2 and 3 — 2x always lands on the constrained slots. Both Slots 2/3 get 2x automatically.
- C) Only Slots 1-3 — Slot 4 is excluded (it already gives a special joker). 2 of 3 are marked.

> A)

---

### 7. Is there a cap on how many special jokers a player can hold?

A player who keeps answering Slot 4 questions correctly earns random special jokers. Can they stockpile unlimited Steals?

- A) No cap — unlimited inventory. Players can hoard jokers.
- B) Cap of 1 per type — can hold at most 1 Steal, 1 Curse, 1 Snipe, 1 Double Down. If you'd earn one you already have, you get nothing (or re-roll).
- C) Cap of 2 per type — moderate limit.

> B)

---

### 8. When Slot 2/3 falls back to whole-board placement (because no row/column has enough empty fields), should the UI indicate this?

The current SPEC silently promotes the slot — the player sees "Slot 2" but gets whole-board placement rules.

- A) Silent fallback — don't indicate it. The player just sees the question card as normal.
- B) Visual indicator — show a different border or label (e.g., "Open" instead of "Row B") so the player knows the constraint changed.

> There should be no such fallback. What do you mean not enough empty fields? There will always be at least one empty field since the player hasn't won yet and if that is the case then the player is just lucky that it worked out so that the "random" choice is forced into hte last empty field. I think that is a core game mechanic in the endgame.

---

## Voice & Audio — Blocking

### 9. How many correct/incorrect narrator reaction variations should there be?

The SPEC says "a few variations" but doesn't give a count. This directly determines how many voice lines need to be pre-generated.

- A) 3 correct + 3 incorrect — small variety, manageable voice line budget
- B) 5 correct + 5 incorrect — more variety, less repetitive over a long game
- C) 8+ each — high variety, but more ElevenLabs cost and more audio files to bundle

> B)

---

### 10. Is there background music or ambient audio, or only voice lines and sound effects?

The SPEC mentions a heartbeat SFX for time limits and sound effects for the peg roulette, but never mentions background music.

- A) No background music for V1 — only voice lines and spot SFX (correct chime, wrong buzz, roulette tick, victory fanfare). Simpler.
- B) Ambient background music — a subtle loop during gameplay. Adds atmosphere but needs royalty-free music sourcing.

> Yes there should be background music which will be sourced during the development. We should at least insert the possibility for this background loop.

---

## Visual Design — Blocking

### 11. What are the 6 player colors, and which shape pairs with each?

The SPEC says "each player chooses a color" and mentions colorblind-safe shapes (circle, square, triangle, diamond, star, hexagon) but never maps colors to shapes.

- A) Fixed mapping — define it now. Proposed: Red/Circle, Blue/Square, Green/Triangle, Yellow/Diamond, Purple/Star, Orange/Hexagon.
- B) Player picks both — during setup, the player chooses a color AND a shape independently.
- C) Player picks color, shape is auto-assigned — each color always has the same shape (fixed mapping), but the player only picks color.

> Actually no, remove the shapes. Also remove all of the extra attention for the color blind. This will never happen, we dont care

---

## Game Flow — Important but not day-1 blocking

### 12. Does the soft time limit timer continue during the Pass Screen?

If a player answers wrong and the question passes to the previous-round player, should the same timer keep ticking?

- A) Timer stops — the pass player gets no time pressure. Fresh experience.
- B) Timer continues — the pass player gets whatever time remains. Adds tension.
- C) Timer resets — the pass player gets a fresh (possibly shorter) time limit.

> C)

---

### 13. Does a correct Gambler answer count toward `questions_correct` (which affects 2x boost eligibility)?

The Gambler bypasses normal question selection. If a player uses the Gambler and answers correctly, does their `questions_correct` stat increase?

- A) Yes, it counts — consistent tracking. The player's success rate reflects all correct answers.
- B) No, Gambler is separate — the Gambler is a "side bet" and doesn't affect the 2x boost catch-up mechanic.

> A)

---

### 14. Can a player use a special joker they just earned from Slot 4 in the same turn?

Edge case 12 in the state machine says "cannot be used in the same turn" but the UI implications aren't clear.

- A) Cannot use same turn — joker appears in inventory but is visually dimmed/locked until next turn. Clear visual indicator.
- B) Can use same turn — earned joker is immediately available. More exciting but potentially overpowered.

> A)

---

## Pipeline / Content — Can be deferred slightly

### 15. What is the full category and subcategory taxonomy?

The IDEA.md lists 13 major categories with examples of subcategories but never finalizes the full list. The pipeline needs `categories.yaml` before generating questions. This can be a separate task but needs to happen before any question generation.

- A) Define it now as part of this form — I'll propose a full taxonomy for approval.
- B) Define it separately — create a dedicated form/document for the category taxonomy before starting the pipeline.

> I will do this later, the initial implementation should contain a reasonable suggestion but which can edited later on.

---

### 16. Should `corpus gaps` output be machine-readable (pipeable to `generate-batch`)?

The SPEC says the output "can be piped into generate-batch" but the format isn't defined.

- A) JSON output by default — structured, pipeable. `quizthat corpus gaps --format json | quizthat generate-batch --from-stdin`
- B) Human-readable table by default, `--json` flag for machine-readable output
- C) Don't worry about piping for V1 — just make it human-readable. Automate later.

> B)

---

### 17. What should `--dry-run` do in `generate-batch`?

The SPEC mentions `--dry-run` but doesn't define what it shows.

- A) Show what would be generated — list the prompts/categories/difficulties that would be used, without invoking the agent or TTS. Cheap preview.
- B) Generate questions but skip TTS — save the JSON files without voice lines. Useful for content review before spending ElevenLabs credits.

> A)

---
