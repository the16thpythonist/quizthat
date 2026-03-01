# QuizThat! SPEC --- Expert Feedback

## Summary & Consensus

### Top 5 Strengths

1. **Question-as-folder data format is excellent.** Self-contained, inspectable, portable. Every reviewer acknowledged this as a clean design that makes the corpus easy to debug, version, and extend. (All 5 perspectives)
2. **The CLI interface design is well thought out.** `generate` (single, with live progress), `generate-batch` (bulk), and `corpus` (management) cover the right workflows. (LLM Engineer, Audio Engineer)
3. **Screen flow covers the full game loop.** The 9 screens (5.1–5.9) map logically to the turn structure from IDEA.md. The Turn Gate handoff pattern solves the shared-device problem cleanly. (UX Engineer, Backend Dev)
4. **Pre-generated audio over runtime TTS is the right call.** Eliminates API dependencies during gameplay, ensures consistent quality, and works fully offline. (Audio Engineer, Backend Dev)
5. **i18n is a first-class concern, not an afterthought.** Per-language question files, language-partitioned corpus, and native generation (not translation) are all correct architectural choices. (i18n Specialist)

### Top 5 Gaps/Concerns

| # | Gap | Severity | Raised By |
|---|-----|----------|-----------|
| 1 | **No game state machine defined.** The SPEC has screens but no formal state model for the turn lifecycle — joker interventions, pass mechanic branching, 2x boost, and multi-peg placement create a complex directed graph that cannot be implemented from screen descriptions alone. | Critical | Backend Dev, UX Engineer |
| 2 | **No game session data model.** Question format is well-specified, but there is no schema for runtime game state (player boards, joker inventories, turn tracking, correct-answer counts, question history). | Critical | Backend Dev |
| 3 | **Missing screens for key interactions.** No UI defined for: opponent-targeting jokers (Steal/Curse/Snipe target selection), The Gambler peg-staking confirmation, multi-peg placement (2x boost, Gambler 3-peg reward), or the tutorial. | Critical | UX Engineer, Backend Dev |
| 4 | **Question type schemas incomplete.** The SPEC only shows the multiple-choice `answer_data` schema. Sorting, Map Location, and Calculation types have no defined schemas, and Audio/Listening questions have no asset-sourcing pipeline. | Significant | LLM Engineer, Backend Dev |
| 5 | **Cultural bias in difficulty is unaddressed.** A "medium" question about American sports is trivially easy for Americans but very hard for German players. Difficulty calibration has no objective criteria and no per-language adjustment mechanism. | Significant | i18n Specialist, LLM Engineer |

### IDEA.md Mechanics Missing or Under-Specified in the SPEC

| Mechanic | Status |
|----------|--------|
| Special joker activation timing and target selection UI | Not in SPEC |
| The Gambler: full rules (peg selection, question difficulty, 3-peg placement flow) | Under-specified |
| Expertise weighting (major vs. subcategory draw probability) | Not in SPEC |
| Question selection algorithm (category diversity, depletion, constraint generation) | Not in SPEC |
| "Previous round player" pass mechanic — precise definition and edge cases | Ambiguous |
| 2x catch-up boost — metric tracking, slot eligibility for boost | Under-specified |
| Basic joker re-earning mechanism | Not in SPEC |
| Starting peg symmetry algorithm | Not in SPEC |
| Technology stack (native vs. cross-platform vs. web) | Explicitly deferred but cascading |
| Game persistence (auto-save, resume) | Not in SPEC |
| Sound effects (correct/incorrect, peg drop, victory, heartbeat timer) | Not in SPEC |
| Full category/subcategory taxonomy as a shared config | Not in SPEC |

### Disagreements

- **Multilingual question generation strategy**: The i18n Specialist recommends a hybrid approach (shared factual core, natural rephrasing per language). The LLM Engineer recommends generate-then-adapt (primary language first, then adapt). Both agree the SPEC's "natively generated per language" is risky because it can produce semantically different questions. The approaches are compatible — the disagreement is about implementation order.
- **Audio question handling**: The Audio Engineer recommends deferring audio/listening questions to V2 entirely. The LLM Engineer agrees the automated pipeline can't handle them but suggests manual curation for V1. Both agree the SPEC under-specifies this.

### Prioritized Recommendations

**Must add to SPEC (blocking for implementation):**

1. **Formal game state machine** — State enum, transition function, legal joker actions per state, pass mechanic branching. This is the single biggest gap.
2. **Game session data model** — Player state schema (board, jokers, stats), turn state, game settings persistence.
3. **Missing screen specs** — Joker target selection modal, Gambler confirmation, multi-peg sequential placement flow, interactive tutorial.
4. **Complete `answer_data` schemas** for sorting, map location, and calculation question types.
5. **Question selection algorithm** — Expertise weighting distribution, category diversity rules, Slot 2/3 constraint generation, depletion fallback.
6. **Full category/subcategory taxonomy** as a shared config file (`config/categories.yaml`) used by pipeline, CLI, and game.

**Should add to SPEC (significant quality impact):**

7. **Phone layout adaptations** — Carousel/scrollable stack for question selection, horizontal scroll for board viewer on phone.
8. **Split answer audio** into per-option files for clean playback interruption.
9. **Sound effects asset list** separate from voice lines (correct/incorrect, peg drop, heartbeat, victory fanfare).
10. **Game persistence** — Auto-save after every action, resume on app relaunch, screen wake lock.
11. **Per-language difficulty overrides** in `question.{lang}.json` and objective difficulty calibration criteria.
12. **Expanded voice config** (model_id, stability, similarity_boost, output_format) and loudness normalization (-16 LUFS).

**Nice to have (polish):**

13. TTS provider abstraction interface for future provider swaps.
14. Question retirement/refresh lifecycle (`quizthat corpus retire`, `corpus refresh`).
15. Corpus quality dashboard beyond quantitative stats.
16. SSML support for improved number/date pronunciation in voice lines.
17. RTL/CJK future-proofing acknowledgment in i18n architecture.

---

## Mobile/Tablet UX Engineering

### Overview

This review evaluates the SPEC from the perspective of building a shared-device game that must work reliably on tablets (landscape, primary) and phones (portrait, secondary). The spec is well-structured and clearly written. The issues below are real implementation concerns, not nitpicks --- each one will surface during development or user testing if not addressed.

---

### 1. Screen Flow Implementability (Sections 5.1--5.9)

**Verdict**: The screen flow is logically sound and covers the full game loop. However, several screens have layout and interaction issues that need resolution before implementation.

**Missing screen: Joker target selection.** The IDEA.md describes jokers like Steal, Curse, and Snipe that require the player to choose a target opponent (and for Snipe, a specific field on that opponent's board). The SPEC's screen flow (5.4--5.8) never describes a target selection UI for these jokers. This needs its own screen or modal: show opponent avatars (color + shape + name), let the player tap to select a target, and for Snipe, show that opponent's board for field selection. Without this, the most dramatic moments in the game have no defined UX.

**Missing screen: The Gambler confirmation.** The Gambler joker stakes a peg the player already owns. Before activating it, the player should see *which* peg is at stake (or at least understand the risk). The spec says nothing about a confirmation dialog or peg preview for this joker. Suggestion: show a confirmation modal --- "You will risk the peg at [field]. Proceed?" --- with the board highlighting the staked peg.

**Missing screen: Slot 4 double-peg placement.** With the 2x boost on Slot 4, the player earns 2 freely placed pegs plus a special joker. The Board Update Screen (5.8) only describes placing a single peg. For 2x rewards, define the flow: does the player place peg 1, see an animation, then place peg 2? Or select both fields at once? Sequential is simpler and avoids confusion. Same question applies to Double Down joker results and The Gambler's 3-peg reward.

**Missing: How to Play / Tutorial.** Section 5.1 lists a "How to Play" link on the start screen, but no tutorial screen is specified. For a game with this many mechanics (4 slot types, 8+ jokers, expertise system, pass mechanic, 2x boost, board constraints), an in-app tutorial is essential, not just a link. Suggestion: an interactive walkthrough that plays a mock turn, or at minimum a paginated illustrated guide (5--7 screens).

---

### 2. Responsive Layout: Tablet Landscape vs. Phone Portrait

The spec states "optimized for tablet landscape but fully functional on phone portrait." This is a reasonable goal, but several screens will break down on phone without explicit adaptation.

#### 2a. Question Selection Screen (5.4) --- Critical

This is the most information-dense screen in the app. Each of the 4 cards must show:
- Teaser title (large text)
- Major category label
- Difficulty icon (1--4 stars)
- Slot type styling (bronze/silver/gold border)
- Board constraint text for Slots 2/3
- Optional 2x badge

Four cards arranged **vertically** with a joker tray at the bottom means the screen must fit 4 cards + tray in portrait. On a phone (roughly 640--750pt logical height in portrait, minus status bar and safe areas), each card gets approximately 120--130pt of height. That is tight for the amount of information specified plus comfortable touch targets.

**Suggestion**: On phone portrait, switch to a **scrollable card stack** or a **swipeable carousel** (one card visible at a time with peek edges showing adjacent cards). The narrator reads them sequentially anyway, so revealing them one-at-a-time aligns with the audio flow. Alternatively, reduce card content on phone: show only teaser title + difficulty + slot accent, and move category/constraint into a detail row that appears on focus.

#### 2b. Player Setup Screen (5.2)

Adding 2--6 players with name entry, color picker, and expertise selection (tappable category cards that expand to show subcategories) is a lot of UI. On tablet landscape this works as a wide list. On phone portrait, the expertise selection alone --- 13 major categories as tappable cards, each expandable --- could easily require 3+ scrollable screens of content per player.

**Suggestion**: Use a bottom sheet or full-screen modal for expertise selection, triggered per-player. Show only the player list in the main view; tapping a player opens their configuration. For Quick Start presets, place them prominently at the top of the expertise modal to encourage their use and skip detailed selection.

#### 2c. Board Viewer Overlay (Section 7)

The spec says "all player boards in a compact grid layout (2-row layout for 4--6 players)." On phone portrait, fitting 6 boards (each a 4x4 or 5x5 grid with labels) in a 2x3 layout is going to produce boards too small to read. A 5x5 board at ~50pt width is illegible.

**Suggestion**: On phone, show boards in a horizontally scrollable row (one or two visible at a time) rather than a grid. Keep tap-to-zoom as specified. Show a mini peg-count summary bar at the top so players get the quick comparison without needing to read every board.

#### 2d. Board Update Screen (5.8)

On tablet, showing "the board large, centered" works. On phone portrait with a 5x5 board, the fields need to be large enough for accurate tapping. A 5x5 grid with comfortable touch targets (44pt minimum per Apple HIG / 48dp per Material) requires 220--240pt in each dimension. This is feasible on phone portrait but leaves little room for the shuffling animation, player info, and any instructional text.

**Suggestion**: On phone, let the board occupy the full width (minus safe area margins). Place the animation and instructional text above the board in a collapsible area that shrinks once the player needs to tap a field.

---

### 3. Touch Target Analysis

#### 3a. Joker Tray (5.4, 5.5)

The spec describes "small icons for each joker" at the bottom of both the Question Selection and Question screens. A player starts with 4 jokers and can earn more (Steal, Curse, Snipe, Double Down). If a player has 6--8 jokers displayed as small icons, on a phone this row will have cramped targets.

**Suggestion**: Use a **scrollable pill strip** or a collapsed tray that expands on tap. Show only usable jokers prominently (full opacity, adequate size); hide spent jokers behind a "spent" indicator rather than displaying them as grayed-out icons that still consume layout space. Minimum touch target: 44x44pt (iOS) / 48x48dp (Android).

#### 3b. Sorting Questions --- Drag-and-Drop

The spec says "drag-and-drop list with large pill-shaped items. Support tap-to-swap as an alternative." This is good. One concern: on a shared tablet lying flat on a table, drag-and-drop from different seating positions can be awkward (arm angles, parallax). The tap-to-swap alternative is essential; make sure it is a first-class interaction, not a fallback.

**Suggestion**: For tap-to-swap, use a clear two-step flow: tap item A (it highlights), tap the position to swap it with. Show a visible "selected" state (e.g., raised elevation + color shift). Consider also adding small up/down arrow buttons on each item as a third input method for accessibility.

#### 3c. Map Location Questions

"Zoomable map with a crosshair reticle. Player pans the map under the reticle." This is a well-known mobile pattern (similar to Uber/ride-share pickup pin). Two concerns:

1. **Fat-finger precision**: The spec mentions an "accuracy radius shown as a translucent circle," which is good. Define the radius tiers explicitly (e.g., < 50km = full points, < 200km = partial, > 200km = wrong) so the visual feedback is meaningful.
2. **Confirm action**: There is no mention of a "Confirm" button for the map answer. The player should be able to pan freely without accidentally submitting. Add a prominent "Lock In" / "Confirm" button, consistent with other question types where the player taps a specific answer option.

#### 3d. Calculation Questions --- Custom Numeric Keypad

"Custom numeric keypad embedded in the screen (not the OS keyboard)." Good call avoiding the OS keyboard (it would obscure the question text and break the full-screen game aesthetic). Make sure the keypad includes: digits 0--9, decimal point, negative sign, backspace, and a submit button. Clarify in the spec whether scientific notation or units are needed for any question, as that would change the keypad design.

---

### 4. Turn Gate Screen (5.3) --- Handoff Concerns

The Turn Gate is critical for a shared-device game. The spec describes a full-screen overlay in the upcoming player's color with a tap-to-continue interaction.

**Issue: No lockout duration specified.** The spec says "the player taps to continue" but does not mention any delay before the tap becomes active. In practice, during fast handoffs, the previous player might accidentally tap through the Turn Gate as they hand the device over.

**Suggestion**: Add a **1.5--2 second lockout** where taps are ignored, and show a subtle visual indicator (e.g., the "Tap to continue" text fades in after the lockout). This is a common pattern in party games (Heads Up!, Psych!). Optionally, require a **long-press** (500ms hold) instead of a tap, which is harder to accidentally trigger.

**Issue: Information leakage.** The spec says "all other information is hidden" on the Turn Gate, which is correct. But on the transition *from* the previous player's result screen *to* the Turn Gate, there is a brief moment where the previous player's board/result is visible. Ensure the Turn Gate renders as an instant full-screen overlay with no transition animation that could leak information.

**Issue: Pass mechanic handoff (5.7).** The pass creates a *second* device handoff within a single turn. The mini Turn Gate for the previous-round player is good, but the flow is: Player A sees "Incorrect" -> mini Turn Gate for Player B -> Player B answers -> correct answer revealed -> Board Update or Turn Gate for Player C. This is three handoffs in the worst case (A -> B -> C). Make sure each handoff has its own lockout and clear visual identity (different accent colors per player).

---

### 5. Board Viewer Overlay (Section 7) --- Z-Index and Interaction Conflicts

"Available on every game screen... does not pause the game or interrupt the current phase."

**Problem**: If the overlay is available during the Question Screen (5.5) where a soft time limit may be running, the time limit continues while the player studies boards. This is correct per spec ("does not pause"), but it could be frustrating if a player opens boards to strategize and loses time. This is a design decision, not necessarily wrong, but it should be explicitly called out so QA does not file it as a bug.

**Problem**: On the Question Selection Screen, if the overlay is semi-transparent, it overlaps the 4 question cards and joker tray. The player needs to dismiss it before interacting with cards. If "tap outside to dismiss" is the mechanism, but the "outside" area is covered by tappable question cards, you get conflicting tap targets. The overlay tap-to-dismiss zone and the underlying interactive elements must not overlap.

**Suggestion**: Use a **modal overlay** that dims the background to ~60% opacity and blocks all interaction with the underlying screen. The board viewer button in the top bar remains the dismiss mechanism (toggle behavior). This avoids all z-index conflicts. On phone, use a full-screen slide-up panel instead.

**Problem**: On the Board Update Screen (5.8), the player needs to tap board fields to place pegs. If the board viewer opens on top of this, and shows *other* players' boards, the player might confuse which board they are interacting with.

**Suggestion**: On the Board Update Screen specifically, consider disabling the board viewer or restricting it to a "view only" mode that does not show the current player's board (since it is already displayed large on screen).

---

### 6. Information Density on Question Selection Cards

As discussed in section 2a, each card carries a lot of data. Even on tablet, showing 4 cards with all this information requires careful visual hierarchy.

**Recommendation**: Establish a clear visual hierarchy per card:
1. **Primary**: Teaser title (largest text, ~18--22pt on tablet, ~16pt on phone)
2. **Secondary**: Difficulty stars + category label (single row, smaller text)
3. **Tertiary**: Constraint text for Slots 2/3, 2x badge (contextual, not always present)
4. **Ambient**: Slot type conveyed through border/accent color only (no label needed --- bronze/silver/gold is self-explanatory once learned)

Do not add a text label for the slot type in addition to the color accent. That would create too much to read per card. Instead, teach slot meaning in the tutorial.

---

### 7. Board Update Screen Animation --- Performance

"The game highlights candidate fields one by one in a brief shuffling animation (like a roulette), then settles on the final candidates."

**Concern**: On low-end Android tablets (common in shared-device / family contexts), CSS or Canvas animations with rapid color changes across multiple grid cells can cause jank, especially if combined with audio playback (the narrator may still be playing a line).

**Suggestion**:
- Keep the animation simple: highlight cells sequentially with opacity transitions (not blur/scale transforms).
- Cap the animation duration at 2--3 seconds max. Longer feels tedious after the 5th turn.
- Provide a "reduced animations" accessibility setting that replaces the roulette with a simple reveal (all candidates glow simultaneously after a 0.5s delay).
- Test on a low-end target device early (e.g., Samsung Galaxy Tab A series or equivalent sub-$200 Android tablet).

---

### 8. Cross-Check Against IDEA.md --- Missing or Underspecified UI

| IDEA.md Mechanic | SPEC Coverage | Gap |
|------------------|---------------|-----|
| Expertise selection (2 majors + 2 subcategories) | Section 5.2 covers it | OK, but "tappable category cards that expand" needs wireframe-level detail for 13 categories |
| 2x Boost (round 3+, fewest correct) | Section 5.4 mentions "2x badge" | **Gap**: No UI for informing the boosted player *why* they have a boost. Add a brief callout: "You are trailing --- 2x boost active!" |
| Pass mechanic | Section 5.7 covers it well | OK |
| The Gambler joker (stake a peg) | Section 5.4 mentions joker tray | **Gap**: No confirmation flow for staking a peg (see section 1 above) |
| Steal / Curse / Snipe / Double Down | Not in screen flow | **Gap**: No target selection UI for opponent-targeting jokers (see section 1 above) |
| Starting pegs (pre-populated boards) | Section 5.2 mentions game settings | **Gap**: No screen or animation for the pre-population. Should the board briefly appear showing pegs being placed? At minimum, the first Turn Gate should show an updated board state. |
| "All boards are always visible" (IDEA.md) | Section 7 Board Viewer | **Partial gap**: IDEA.md says boards are "always visible." The spec implements this as an on-demand overlay, which is a reasonable interpretation for digital. But "always visible" could also mean a persistent mini-board bar. Clarify intent. |
| Physical board integration | Not addressed | Out of scope for now (IDEA.md marks it as "long-term vision"), but the digital board UI should be designed knowing that a physical mirror exists. E.g., field labels (A1, B3) must be unambiguous and large enough to read aloud. |
| Multiple jokers per turn (not same type) | Not in UI spec | **Gap**: If a player uses Reveal Hint and then wants to use Reshuffle Question in the same turn, the UI must support sequential joker activation. The joker tray should remain interactive after one joker is used. Clarify whether there is a "joker cooldown" animation or if it is instant. |
| Correct answer not revealed until pass resolves | Section 5.7 covers this | OK |
| Weighted expertise probability | Not UI-relevant | N/A |

---

### 9. Additional Recommendations

**9a. Safe area handling.** The spec does not mention safe areas (notch/dynamic island on iOS, gesture bar on Android). Every full-screen layout (Turn Gate, Victory Screen, Question Screen) must respect safe area insets. The Turn Gate in particular --- being a solid color with centered text --- will look broken if text renders behind a notch.

**9b. Orientation locking.** The spec says "tablet landscape primary, phone portrait functional" but does not say whether orientation is locked. Recommendation: lock to landscape on tablet, lock to portrait on phone, with an option in settings to override. Do not allow free rotation during gameplay --- it would interrupt animations and confuse the handoff flow.

**9c. Accidental back/home navigation.** On a shared tablet lying on a table, players (especially younger ones) will accidentally hit the home button or swipe up the app switcher. The app should save game state aggressively (after every turn at minimum) and restore seamlessly on relaunch, including the current player's turn phase.

**9d. Screen brightness and timeout.** During a 6-player game, turns can take 1--2 minutes each. The spec should mandate that the app requests a screen wake lock to prevent the device from sleeping mid-game. Also consider auto-brightness being set low in a dim room --- a settings reminder or auto-brightness override might improve the experience.

**9e. Audio/speaker orientation.** The spec mentions "tablet/phone speakers in a noisy social environment." Tablets have stereo speakers that project in specific directions. If the tablet is flat on a table, bottom-firing speakers are muffled. The spec should recommend external speaker support and ensure the volume control is easily accessible (not buried in a settings menu). A persistent volume icon in the top bar alongside the board viewer icon would be ideal.

---

### Summary of Critical Items

1. **Define missing screens**: Joker target selection, Gambler confirmation, multi-peg placement flow, tutorial.
2. **Adapt question selection layout for phone**: 4 vertical cards + joker tray will not fit. Use a carousel or scrollable stack.
3. **Add Turn Gate lockout timing**: 1.5--2 seconds to prevent accidental tap-through during handoff.
4. **Resolve Board Viewer overlay conflicts**: Use a modal that blocks underlying interaction.
5. **Specify phone-specific board viewer layout**: Horizontal scroll instead of compressed grid.
6. **Test animation performance on low-end devices early**: Keep Board Update roulette simple.
7. **Handle safe areas, orientation locking, wake lock, and game state persistence**: These are baseline requirements for a shared-device mobile game.

---

## Internationalization & Localization

### Overview

This review evaluates the SPEC from an internationalization and localization perspective, covering the question content pipeline, UI string management, voice system, cultural adaptation, and scalability to additional languages. The spec makes a strong commitment to multilingual support from day one --- this is the right call, as retrofitting i18n is far more expensive than building it in. However, several areas need clarification or redesign to avoid real-world localization failures.

---

### 1. "Natively Generated" Questions: Equivalence and Feasibility

The spec (Section 1) states that question content should be "generated natively per language to ensure natural phrasing" rather than translated after the fact. This is an ambitious and laudable goal, but it introduces a fundamental problem: **semantic equivalence across languages**.

**The core issue**: If the agent independently researches and constructs a question about "black holes" in English and German, the two questions may end up testing different facts, having different difficulty levels, or using different distractor strategies. They share a topic but are not the same question. This matters because:

- A player switching languages mid-session (the spec allows changing language in settings) could encounter a completely different corpus, not the same game with different text.
- Difficulty calibration across languages becomes nearly impossible --- you are calibrating two independent question sets, not one set in two languages.
- Duplicate detection must run per-language, doubling the validation surface.

**Suggestion**: Use a **hybrid approach**. The pipeline should generate the question once in a primary language (including answer structure, correct answer, and distractors), then generate the other language version(s) constrained to the same factual content and answer structure. This is not simple translation --- the agent can rephrase naturally in each language --- but the factual core (what is being asked, what the correct answer is, what the distractors are) must be identical. The `correct_index` in `answer_data` should be the same across all language files for a given question. The spec should explicitly require this invariant.

**Exception**: Some question types are inherently language-bound (see section 2 below) and cannot share structure across languages. These should be flagged as such.

---

### 2. Language-Specific Questions: The "Language" Category Problem

The IDEA.md lists "Language" as a major category with subcategories like "Etymology," "Grammar," and "Linguistics." These questions are inherently tied to a specific language. An etymology question about English word origins is meaningless when presented in German, and vice versa.

**The spec does not address this at all.** The current model assumes every question can exist in every language, with partial coverage as a fallback. But language-specific questions are not a "partial coverage" situation --- they are fundamentally untranslatable.

**Suggestion**: Introduce a `language_specific` flag in `meta.json`:

```json
{
  "language_specific": true,
  "primary_language": "en"
}
```

Questions with `language_specific: true` are only shown when the game language matches `primary_language`. The pipeline should generate equivalent-but-different questions in the Language category for each target language. For example, an English etymology question and a German etymology question are both tagged as Language/Etymology but are completely independent questions, each flagged as language-specific to their respective language.

This also applies to parts of other categories: Literature questions about German-language authors (Goethe, Kafka) may require German-specific phrasing, wordplay questions in Pop Culture are language-bound, and so on. The flag should be available for any category, not just Language.

---

### 3. Corpus Balance Under Language Filtering

The spec acknowledges that "some [questions] may only be available in a subset" of languages and that "the game filters the corpus at runtime to questions that support the active language." This is correct, but the downstream consequences are not addressed.

**Problem: Uneven corpus distribution.** If the pipeline generates 1000 questions but only 700 support German, German-language players get 30% fewer questions. Worse, the gap may be unevenly distributed across categories and difficulties. German players might get a full set of Science questions but only half the Literature questions (because many Literature questions are English-specific). This skews the game experience:

- The expertise system becomes less reliable --- a player selecting Literature as an expertise category might get fewer expertise questions in German.
- Slot 1 (expertise-drawn) may fall back to non-expertise questions more often for German players if their chosen categories are thin.
- The `corpus gaps` CLI command (Section 2) needs to report gaps **per language**, not just overall.

**Suggestion**:

1. The `quizthat corpus gaps` command must accept a `--language` flag and report per-language coverage. The batch generation pipeline should target per-language minimums, not just overall counts.
2. Define a minimum corpus threshold per language per category-difficulty bucket (e.g., at least 20 questions per subcategory per difficulty per language). If a bucket falls below this threshold, the game should avoid drawing from it or merge it with a parent category.
3. The `quizthat corpus stats` output should include a language coverage matrix: for each category/difficulty pair, show how many questions exist per language. This makes imbalances immediately visible.

---

### 4. Category and Subcategory Name Localization

The spec says "category and subcategory names [are] displayed in the selected language" (Section 1) but never specifies **where these translations are stored or maintained**.

**Options and tradeoffs**:

- **Option A: In the i18n key-value files** (`i18n/en.json`, `i18n/de.json`). This is the simplest approach and keeps all translatable strings in one place. The category taxonomy is defined once (e.g., in a `config/categories.json` with machine keys like `science.physics`), and the display names come from the i18n files. This is the recommended approach.
- **Option B: In a separate taxonomy config** (e.g., `config/categories.yaml` with per-language names inline). This couples taxonomy structure with translations, making it harder to hand off translations to a non-technical translator.
- **Option C: In each question's `meta.json`**. This is the worst option --- it duplicates category names thousands of times and makes renaming a category a mass file edit.

**Suggestion**: Use Option A. Define the category taxonomy as a structured config with stable keys, and put all display names (major categories, subcategories, Quick Start preset names like "History Buff") into the i18n string files. Add this to the spec explicitly to prevent inconsistent implementations.

---

### 5. UI String Expansion: German Text Length

German text is on average **30--40% longer** than equivalent English text. Some common game terms expand dramatically:

| English | German | Expansion |
|---------|--------|-----------|
| "Your turn" | "Du bist dran" | +63% |
| "Incorrect!" | "Falsch!" | -20% |
| "Choose your placement" | "Wähle dein Platzierungsfeld" | +56% |
| "Reshuffle Selection" | "Auswahl neu mischen" | +33% |
| "Reveal Hint" | "Hinweis anzeigen" | +40% |
| "The Gambler" | "Der Spieler" / "Das Glücksspiel" | varies |

**Impact on the UI**:

- **Question Selection Cards (5.4)**: Teaser titles generated in German will be longer. If the card layout uses fixed-height containers, German teasers will clip or overflow. As the UX engineer's feedback already notes, these cards are tight on space.
- **Joker names**: The joker tray uses "small icons" --- but joker names also appear in activation callouts, confirmation dialogs, and the narrator voice. If any UI element displays joker names as text labels, German names may not fit.
- **Button labels**: "Start Game" vs "Spiel starten," "Play Again" vs "Nochmal spielen" --- these expand and can break fixed-width button layouts.
- **Board constraint labels**: "Column B / Row 3" vs "Spalte B / Reihe 3" --- 60% longer.

**Suggestion**:

1. **Never use fixed-width text containers for translatable strings.** Use flexible layouts that grow with content, with a defined maximum after which text truncates with an ellipsis.
2. **Set a maximum character count for teaser titles per language** in the generation pipeline. English teasers: max 40 characters. German teasers: max 50 characters. The pipeline should enforce this during question construction.
3. **Test every screen with German strings during development**, not just at the end. German is the longest supported language and serves as the stress test for layout.
4. **Use pseudolocalization** during development (e.g., pad English strings with 40% extra characters and add accented characters) to catch layout issues before German translations are even available.

---

### 6. Voice Line Timing and Pacing

The spec says the narrator reads out each teaser title during question selection and that this "should take ~10 seconds total" (Section 5.4). German speech is generally **10--15% slower** than English for equivalent content, and the text itself is longer.

**Problem**: Four German teaser titles will take noticeably longer to read aloud than four English teasers. If the UI animation is timed to the English narration cadence, German narration will either be cut off or the animation will finish before the audio does.

**Suggestion**:

1. **Drive UI animation timing from the audio duration, not from a fixed timer.** The game should query the duration of each voice line and pace the card reveal/highlight animation accordingly.
2. **Set per-language pacing parameters** in the voice configuration (e.g., inter-teaser pause duration) so that the overall readout feels natural in each language.
3. For the full question readout (Section 5.5), ensure the answer options are not displayed until the narrator finishes reading the question text. If the UI reveals answers on a fixed timer, German players will see answers before the question has been fully read aloud.

---

### 7. Voice Selection and Cultural Fit

The spec defines voice configuration in `config/voices.yaml` with a single voice per language. This is a reasonable starting point, but consider:

**Gendered voice expectations**: Different cultures have different expectations for authoritative narrator voices. The spec should note that voice selection is a cultural decision, not just a technical one. Test voice choices with native speakers of each language before finalizing.

**Pronunciation of names and loanwords**: The German narrator voice will need to handle English loanwords (common in technology, pop culture, and sports categories). Similarly, the English narrator may need to pronounce German names in history or literature questions. TTS engines handle cross-language words with varying quality. The spec should acknowledge this and recommend:

- Using SSML `<lang>` tags (if the TTS provider supports them) to switch pronunciation models for foreign words within a question.
- Alternatively, avoiding loanwords in the voiced portions of questions where possible, and keeping foreign proper nouns short.

---

### 8. Configuration Format Inconsistency

The spec uses **JSON** for i18n string files (`i18n/en.json`) and question data (`meta.json`, `question.en.json`) but **YAML** for voice configuration (`config/voices.yaml`). This is a minor inconsistency, but it creates friction:

- Translators and content authors need to work with two formats.
- Validation tooling and schema definitions need to support both.
- If category taxonomy is added as a config (see section 4), a third format decision arises.

**Suggestion**: Standardize on one format for all configuration and content files. JSON is the natural choice since the question data (the bulk of the content) is already JSON, and JSON is more widely supported by i18n tooling. If YAML is preferred for human-editable configs (voices, categories), that is also acceptable --- just be consistent and document the rationale. Do not mix formats within the same logical layer.

---

### 9. Adding a New Language: Effort Assessment

The spec does not describe the process for adding a third language (e.g., French). Based on the current architecture, here is what would be required:

1. **i18n string file**: Create `i18n/fr.json` with all UI string translations. Manageable --- likely 100--200 keys.
2. **Voice configuration**: Add a French entry to `config/voices.yaml` with an appropriate ElevenLabs voice. Straightforward.
3. **Category/subcategory names**: Add French names to wherever they are stored (see section 4 --- this is currently unspecified).
4. **Question corpus**: For every existing question, generate a `question.fr.json` and corresponding audio files (`teaser.fr.mp3`, `question.fr.mp3`, `answers.fr.mp3`). For a corpus of 1000 questions, this is 1000 new JSON files and 3000 new audio files. This is the largest cost by far.
5. **Pre-generated narrator voice lines**: Generate French versions of all fixed narrator lines ("Player Red, your turn," etc.). Roughly 50--100 lines.
6. **Pipeline configuration**: Update the `--languages` defaults and any language-aware validation logic.
7. **Update `meta.json` for each question**: Add `"fr"` to the `languages` array as each question gets its French version.
8. **Testing**: Full playthrough in French to check phrasing, timing, and layout.

**Suggestion**: Document this process as a "Language Addition Checklist" in the spec or in a separate contributor guide. The biggest bottleneck is step 4 (corpus generation). The spec should specify whether new languages are added incrementally (question by question) or in a batch campaign, and how the game handles a partially-translated corpus during the rollout period. The `corpus gaps --language fr` command should be the primary tool for tracking rollout progress.

---

### 10. Cultural Bias in Difficulty Calibration

This is perhaps the most subtle and impactful localization issue. The spec (IDEA.md) requires that "difficulty should be calibrated consistently across all categories." But difficulty is culturally relative.

**Examples**:

- A "medium" History question about the American Civil War is straightforward for American English speakers but expert-level for German speakers. The reverse is true for questions about the Thirty Years' War.
- A "medium" Sports question about the NFL is easy in English-speaking countries but very hard in Germany, where football (soccer) dominates. A question about the Bundesliga would be the opposite.
- Pop Culture questions are heavily skewed by media market: American TV shows, British music acts, and German-language internet culture are largely non-overlapping.

**The current spec has no mechanism to handle this.** A question has a single `difficulty` field in `meta.json`, shared across all languages. But the same question is not equally difficult in all cultural contexts.

**Suggestions**:

1. **Per-language difficulty overrides**: Allow `question.{lang}.json` to optionally override the difficulty from `meta.json`. For example, a question about the NFL might be `"difficulty": "medium"` in `question.en.json` but `"difficulty": "very_hard"` in `question.de.json`. The game uses the per-language difficulty when filtering and displaying.

   ```json
   // question.de.json
   {
     "teaser_title": "...",
     "question_text": "...",
     "difficulty_override": "very_hard"
   }
   ```

2. **Pipeline-level cultural review**: During question generation, the agent should assess difficulty from the perspective of each target language's cultural context, not just the original. The validation step (Section 2, step 4) should include a cultural appropriateness check.

3. **Content guidelines for the pipeline**: Establish rules such as: "For categories like History, Sports, and Pop Culture, prefer topics with cross-cultural relevance (e.g., World Wars, Olympics, globally popular films) over region-specific topics. When region-specific questions are generated, flag them for per-language difficulty adjustment."

---

### 11. Locale-Sensitive Formatting

The spec does not mention locale-sensitive formatting for non-text content. This matters for:

- **Numbers**: Calculation question answers may involve decimals. English uses a period as the decimal separator (3.14); German uses a comma (3,14). The custom numeric keypad (Section 5.5) must adapt: show a comma key for German, a period key for English. The answer validation must parse the input according to the active locale.
- **Dates**: If any question text includes dates, formatting differs (MM/DD/YYYY in US English, DD.MM.YYYY in German). The pipeline should format dates according to the target language.
- **Units of measurement**: Metric is standard in German-speaking countries. If a question involves miles, Fahrenheit, or other imperial units, the German version should convert to metric equivalents (or the question should use metric universally and convert for English if needed).

**Suggestion**: Add a "Locale Formatting" subsection to Section 1 (Internationalization) specifying that all numeric, date, and unit formatting must respect the active language's locale conventions. The pipeline must generate locale-appropriate content, and the custom keypad must adapt its input keys.

---

### 12. Right-to-Left and Script Considerations (Future-Proofing)

The current language set (English, German) is Latin-script and left-to-right. However, if the app ever adds Arabic, Hebrew, or other RTL languages, the entire UI layout must mirror. Similarly, CJK languages (Chinese, Japanese, Korean) have different typographic requirements (line breaking, character spacing, vertical text).

**Suggestion**: This does not need to be solved now, but the spec should acknowledge that the i18n architecture is designed for LTR Latin-script languages initially. If RTL or CJK support is a future goal, the UI framework choice should support `dir="rtl"` layout mirroring, and the i18n string files should support pluralization rules (which vary wildly by language --- English has 2 plural forms, German has 2, but Arabic has 6, and some languages have none).

Concretely for the current scope: use an i18n library that supports ICU MessageFormat or a similar pluralization/interpolation standard (e.g., `i18next` for web/React, `flutter_localizations` for Flutter, `NSLocalizedString` with `.stringsdict` for iOS). Avoid hand-rolling string interpolation with simple `%s` substitution --- it breaks for languages with different word order or plural rules.

---

### 13. Cross-Check Against IDEA.md: Localization Implications of Game Mechanics

| IDEA.md Mechanic | Localization Implication | Spec Coverage |
|------------------|------------------------|---------------|
| Player referred to by color ("Player Red") | Color names must be translated and may have grammatical gender in German ("Spieler Rot" vs "Spielerin Rot"). The spec should decide: use gendered forms, or use a neutral phrasing like "Rot ist dran" (Red's turn). | Not addressed |
| Expertise selection (category names) | All 13 major categories and their subcategories need translated display names. Quick Start preset names ("History Buff") need culturally appropriate translations, not literal ones. | Partially addressed (Section 1 says they are displayed in selected language, but storage location is undefined) |
| Teaser titles ("What Falls Up?") | These are creative/evocative phrases. The pipeline must generate them natively per language, not translate them. A clever English pun will not work in German. | Covered by "natively generated" principle, but should be explicitly called out for creative content |
| Board field labels (A1, B3) | Letters and numbers are universal, so field labels do not need translation. Good. | N/A |
| Joker names (Steal, Curse, Snipe, The Gambler) | These are brand-like names. Decide whether to translate them ("Stehlen," "Fluch," "Scharfschuetze," "Der Spieler") or keep them in English as game-specific proper nouns. Both approaches are valid; consistency matters. Translated names are more accessible; English names are more recognizable across languages. | Not addressed |
| Pass mechanic voice line ("[Color], your chance!") | Must be localized. German phrasing may differ structurally: "Deine Chance, [Farbe]!" (Your chance, [Color]!). The i18n system must support variable placement within the string, not assume English word order. | Covered by voice line spec but interpolation format not defined |
| Narrator reactions (correct/incorrect) | Multiple variations specified for variety. Each variation needs a natural equivalent in every language, not a word-for-word translation. E.g., "Nailed it!" does not translate literally to German. | Not addressed at the variation level |

---

### Summary of Critical Items

1. **Enforce semantic equivalence across languages**: Questions must share the same factual core (answer structure, correct answer, distractors) across all language versions. Define this as a pipeline invariant.
2. **Handle language-specific questions**: Add a `language_specific` flag to `meta.json` for questions that are inherently tied to one language (Etymology, wordplay, language-specific literature). Generate independent equivalent questions per language for these categories.
3. **Report corpus gaps per language**: The `corpus stats` and `corpus gaps` CLI commands must break down coverage by language. Define minimum per-language thresholds per category/difficulty bucket.
4. **Standardize category name storage**: Use the i18n key-value files for all display names (categories, subcategories, presets, joker names). Document this explicitly.
5. **Design for German text expansion**: Never use fixed-width containers for translatable strings. Set maximum character counts for teaser titles per language. Test all screens with German text during development.
6. **Drive UI timing from audio duration**: Do not use fixed timers for narrator-synced animations. Query voice line duration and pace accordingly.
7. **Add per-language difficulty overrides**: Allow `question.{lang}.json` to override the base difficulty from `meta.json` to account for cultural bias in question difficulty.
8. **Handle locale-sensitive formatting**: Decimal separators, date formats, and units of measurement must respect the active locale. The custom numeric keypad must adapt.
9. **Use a proper i18n library with interpolation and pluralization support**: Do not hand-roll string formatting. Support variable placement and plural forms from the start.
10. **Decide and document joker name and color name translation strategy**: Translate or keep as English proper nouns --- either is valid, but the decision must be explicit and consistent.

---

## Backend & App Architecture

### Overview

This review evaluates the SPEC from the perspective of implementing the game's data model, runtime state management, question loading, and turn logic. The SPEC provides a solid foundation for the question generation pipeline and data format, but the game application side is severely under-specified for state management, session persistence, and the algorithms that drive core mechanics. Every issue below represents something that a developer would need to invent during implementation, which risks inconsistencies across the codebase.

---

### 1. Game State Machine --- The Biggest Gap

The SPEC describes a screen flow (Section 5) but never defines the underlying **state machine** that governs game logic. The screen flow implies a linear progression, but the actual turn lifecycle is a directed graph with multiple branching paths caused by joker activations, the pass mechanic, and the 2x boost. Without a formal state model, implementing this correctly is guesswork.

**The turn state machine should cover at minimum:**

```
TURN_START
  -> TURN_GATE (handoff screen)
  -> QUESTION_SELECTION
     -> [Joker: Reshuffle Selection] -> QUESTION_SELECTION (re-draw)
     -> [Joker: The Gambler] -> GAMBLER_CONFIRMATION -> GAMBLER_QUESTION -> GAMBLER_RESULT
     -> SELECT_QUESTION -> QUESTION_DISPLAY
        -> [Joker: Reshuffle Question] -> QUESTION_DISPLAY (new question)
        -> [Joker: Reveal Hint] -> QUESTION_DISPLAY (hint visible)
        -> SUBMIT_ANSWER
           -> CORRECT -> BOARD_UPDATE -> [check win] -> TURN_END | VICTORY
           -> INCORRECT
              -> [has previous-round player?]
                 -> YES -> PASS_GATE -> PASS_QUESTION -> PASS_RESULT
                    -> PASS_CORRECT -> BOARD_UPDATE (pass) -> TURN_END
                    -> PASS_INCORRECT | PASS_DECLINED -> REVEAL_ANSWER -> TURN_END
                 -> NO -> REVEAL_ANSWER -> TURN_END
  -> TURN_END -> next player -> TURN_START
```

**Additionally**, opponent-targeting jokers (Steal, Curse, Snipe) earned from Slot 4 can be used at unspecified times. The SPEC does not define:
- **When** special jokers can be activated (immediately upon earning? During future turns? During any phase?)
- **Sequencing** for multi-peg placements with 2x boost (two sequential BOARD_UPDATE states? One state with a multi-placement sub-flow?)

**Suggestion**: Add a dedicated "Game State Machine" section to the SPEC that defines every state, valid transitions, and which jokers/events can trigger at each state. This is the single most important addition needed before implementation.

---

### 2. Game Session Data Model

The SPEC defines the question data format in detail (Section 3) but says nothing about the **game session** data model. A running game needs to track:

```
GameSession {
  id: string
  settings: {
    board_size: 3 | 4 | 5
    placement_candidates: 1..4
    starting_pegs: number
    language: "en" | "de"
  }
  players: Player[]
  current_turn: {
    player_index: number
    round_number: number
    phase: TurnPhase  // from state machine
    selected_slot: 1..4 | null
    selected_question_id: string | null
    offered_questions: QuestionOffer[]  // the 4 options presented
    jokers_used_this_turn: JokerType[]
    boost_active: boolean  // 2x on this slot?
  }
  turn_history: TurnRecord[]
  used_question_ids: Set<string>  // depletion tracking
  status: "setup" | "in_progress" | "finished"
  winner: number | null  // player index
}

Player {
  index: number
  name: string
  color: PlayerColor
  shape: PlayerShape
  expertise: {
    major_categories: string[]  // up to 2
    subcategories: string[]     // up to 2
  }
  board: boolean[][]  // board_size x board_size grid of peg presence
  jokers: {
    reshuffle_selection: number  // count, starts at 1
    reshuffle_question: number
    reveal_hint: number
    the_gambler: number
    steal: number       // special, starts at 0
    curse: number
    snipe: number
    double_down: number
  }
  stats: {
    correct_answers: number      // for catch-up mechanic
    total_questions_answered: number
    pegs_placed: number
  }
}
```

**Key design decisions the SPEC should address:**

1. **Joker inventory model**: The IDEA says jokers are "one-time use, but spent jokers can be re-earned." This implies jokers should be tracked as counts (0, 1, 2...), not booleans. The SPEC should clarify the maximum count per joker type --- can a player stockpile 5 Steals?

2. **Board representation**: A simple 2D boolean grid works, but with Steal/Snipe jokers that remove opponent pegs, we also need to track *whose* pegs are where if multi-colored display is desired. The IDEA says "all boards are always visible" --- does the viewer show only the owner's pegs on each board, or are stolen-from markers shown? Current assumption: each board only tracks its owner's pegs (present/absent).

3. **Turn history**: Is this needed? For debugging, yes. For gameplay, it is needed to determine the "previous round player" for the pass mechanic. At minimum, store the last N turns where N = player count, recording which player answered, whether they were correct, and which slot they chose.

**Suggestion**: Add a "Game Session Schema" section to the SPEC with a concrete data model definition, similar to how Section 3 defines the question format.

---

### 3. Question Selection Algorithm

The IDEA describes the 4-slot structure, and the SPEC repeats it, but neither specifies the **actual algorithm** for selecting which questions to offer. This is non-trivial.

**Slot 1 (Expertise):**
- IDEA says questions are drawn from the player's expertise categories with "weighted probability favoring specific subcategories."
- What are the weights? A reasonable default: 60% chance to draw from a selected subcategory, 40% from the broader major category. But this is not specified.
- What difficulty range? The table says "Any" --- does this mean uniform random across Easy/Medium/Hard/Very Hard? Or weighted toward Medium?
- Edge case: What if the player's chosen subcategories have been exhausted (all questions used)? Fall back to major category? Fall back to any category?

**Slots 2 & 3 (Random):**
- "Random category, Random difficulty." Truly uniform random? Or should the algorithm avoid repeating categories seen in the same selection? (Presenting 4 questions all from "Science" would be a poor experience.)
- The board constraint (row/column) is revealed on the card. How is the row/column chosen? Random from rows/columns that still have empty fields within them?
- What if the revealed row/column is already full? The placement would be impossible. The algorithm must check for available empty fields in the constraint before presenting the option.

**Slot 4 (Hard/Very Hard):**
- "Hard or Very Hard" --- is the split 50/50? Always very hard? Configurable?
- The special joker reward: which of the 4 special jokers (Steal, Curse, Snipe, Double Down) is awarded? Random? Player's choice? Rotating?

**Depletion tracking:**
- The corpus is finite and ships with the app. In a long game (5x5 board, 6 players), dozens of questions will be consumed. The game must track which questions have been used and exclude them from future draws.
- What happens when a category/difficulty bucket is empty? Silent fallback to adjacent difficulty? Notify the player? This needs a defined behavior.

**Duplicate prevention within a selection:**
- The 4 offered questions should not include duplicates (different questions, ideally different categories). This is an implicit requirement but should be explicit.

**Suggestion**: Add a "Question Selection Algorithm" section specifying: weight distributions for expertise draws, category diversity rules for the 4-card draw, row/column constraint selection logic, depletion fallback behavior, and special joker award rules.

---

### 4. Question Corpus Loading and Indexing at Runtime

The SPEC defines questions as individual folders with JSON files and audio assets (Section 3). For runtime, the game needs to:

1. **Index the corpus**: At app launch (or first game start), scan all question folders, parse `meta.json` for each, and build an in-memory index by category, subcategory, difficulty, language, and used/unused status.

2. **Lazy-load question content**: Only load the full `question.{lang}.json` and audio files when a question is actually selected. Loading hundreds of question JSONs at startup is wasteful.

3. **Audio preloading**: During the Question Selection screen, the 4 teaser audio files should be preloaded so narration starts without latency. When the player selects a question, preload the full question audio and answer audio.

**The SPEC does not address any of this.** It describes the folder format but not how the app consumes it.

**Architecture recommendation:**

- **Build a corpus index file** during the build/packaging step: a single `corpus-index.json` that maps `question_id -> { category, subcategory, difficulty, languages, question_type }`. This avoids scanning hundreds of folders at runtime.
- **Bundle questions as a flat asset directory** or an embedded SQLite database. SQLite would be ideal: one `.db` file containing the index table plus question content, with audio files remaining as separate assets referenced by path. This gives efficient querying (e.g., "give me 10 unused easy Science questions supporting 'de'") without file system scanning.
- **Alternative for web**: If the app is a web app (the SPEC says "natively playable on tablets and smartphones" without specifying native vs. web), the corpus could be served from an API or bundled as a static JSON manifest with lazy-loaded question files.

**Suggestion**: Add a "Corpus Loading" section specifying: index format, loading strategy (eager vs. lazy), and recommended storage backend (SQLite, bundled JSON, or API).

---

### 5. Pass Mechanic --- "Previous Round" Tracking

The IDEA describes: "the question passes to the player who answered in the previous round (one round behind the current player)."

**Ambiguity**: "Previous round" is not precisely defined.

- **Interpretation A**: The player whose turn immediately preceded the current player's turn in the player order. In a 4-player game with order [A, B, C, D], if it is C's turn, the previous-round player is B.
- **Interpretation B**: The player who most recently completed a turn. This is the same as Interpretation A in normal flow, but differs if turns are skipped for any reason.
- **Interpretation C**: The player who answered a question in the literal previous round (round N-1), at the same position. In a 4-player game in round 3, if player C is answering, the previous-round player is the player who was in slot "current_turn - player_count" in the history.

The IDEA most likely means Interpretation A (the player who just went before). But the SPEC should state this explicitly.

**Edge cases:**
- **Round 1**: No previous player exists. The SPEC (5.6) says "if no pass is applicable (e.g. round 1 where there is no previous-round player), the correct answer is revealed and the turn ends." Good, but is this only round 1's first player, or all players in round 1? If player order is [A, B, C, D] and B answers incorrectly on round 1, does A (who already went this round) count as the "previous round player"? The IDEA says "previous round," which would mean no. The SPEC should clarify.
- **Pass declined or failed**: If Player B passes the question to Player A and Player A gets it wrong, does Player A become the "previous round player" for the next pass? Or is it still tracked based on the normal turn order?

**Suggestion**: Replace "previous round" with an explicit definition: "The player whose regular turn immediately preceded the current player's turn in the current round. In round 1, no pass is available for the first player. From the second player onward in round 1, the pass goes to the player who most recently completed their regular turn." Store `last_regular_turn_player_index` in the game state.

---

### 6. Catch-Up Mechanic (2x Boost) --- State Tracking

The IDEA says: "Starting from round 3, the player who has answered the fewest questions correctly so far receives a boost."

**Implementation questions:**

1. **"Fewest questions correctly"** --- does this count only the player's own answered questions, or also questions answered via the pass mechanic? If a trailing player receives many passes and answers them correctly, their correct count goes up, potentially disqualifying them from the boost even though they are still behind on pegs.

2. **Peg count vs. correct answer count**: The IDEA uses "fewest questions correctly" as the criterion, but peg count would be a more direct measure of who is trailing. A player could answer many questions correctly but have few pegs due to unfavorable random placement. Should the 2x boost target the player with the fewest pegs instead? This seems like a design decision that should be explicitly documented.

3. **Which 2 of the 4 slots get the 2x badge?** The IDEA says "2 of their 4 question options are randomly marked." Pure random among the 4 slots? Or weighted (e.g., never on Slot 4 since it already has max reward)?

4. **2x on Slot 4 interaction**: The IDEA says "2x on Slot 4 means 2 freely placed pegs + the special joker." Does this mean 2 special jokers too, or just 1? One joker seems right, but it should be stated.

5. **Timing**: The boost is determined at the start of the player's turn (during question selection). The correct-answer counts used for comparison must be frozen at that moment, not updated mid-turn.

**Suggestion**: Add a "Catch-Up Mechanic" subsection specifying: the exact metric used (correct answers, pegs, or a composite), whether pass-mechanic answers count, which slots are eligible for the 2x badge, how many special jokers are awarded with 2x on Slot 4, and when the boost determination is calculated relative to turn flow.

---

### 7. Joker System --- Implementation Gaps

#### 7a. Joker Inventory and Acquisition

The IDEA says players start with 4 jokers (one of each basic type) and can re-earn spent jokers plus gain special jokers from Slot 4. **Unanswered questions:**

- **Can a player hold multiples of the same joker?** E.g., earn Steal from two Slot 4 wins. The IDEA says jokers are "one-time use, but spent jokers can be re-earned," which implies yes. The data model should use counts, not booleans.
- **Secondary joker acquisition**: The IDEA says "a secondary mechanic for earning jokers beyond hard-question rewards is planned but not yet defined." The SPEC should either define this or explicitly mark it as out-of-scope for v1. Leaving it as "planned" means the data model and UI must accommodate it, even though it does not exist yet.
- **Basic joker re-earning**: Through what mechanism? The IDEA says "spent jokers can be re-earned through gameplay" but only specifies Slot 4 as a source for special jokers. How does a player re-earn Reshuffle Selection? This is undefined.

#### 7b. Joker Timing and Sequencing

The IDEA says "multiple jokers per turn: allowed, but not of the same type in a single turn." This raises sequencing questions:

- Can a player use Reveal Hint and then Reshuffle Question on the same question? That would mean they see the hint, decide the question is still too hard, and swap it out. The hint would then be wasted. Is this intentional?
- Can a player use Reshuffle Selection (getting new cards) and then The Gambler (ignoring those cards)? The Gambler replaces the entire question flow, so using Reshuffle Selection first would be wasteful. Should the game prevent this?
- **Order enforcement**: Some combinations are logically nonsensical. The state machine should define which jokers are valid at each phase, preventing impossible combinations rather than relying on UI dimming alone.

#### 7c. The Gambler --- Detailed Rules

The IDEA describes The Gambler as: "Stake a random peg you already own. Receive a completely unpredictable question. If answered correctly, gain 3 random pegs. If wrong, lose the staked peg."

- **"Random peg you already own"**: Selected by the game or by the player? "Random" implies the game selects it. But the UX feedback section notes there should be a confirmation showing which peg is staked. So: game randomly selects, player confirms or cancels.
- **"Completely unpredictable question"**: From any category, any difficulty? Including Very Hard? This is not the same as Slot 4 (which is explicitly Hard/Very Hard). Clarify the difficulty distribution.
- **"3 random pegs"**: Using Slot 1-style placement (N candidates from the whole board) per peg? Or just 3 random empty fields, no choice? If placement candidates = 3, that would mean 9 candidate fields for 3 pegs, which is a lot of UI. Simplify: 3 auto-placed random pegs with no player choice (since the reward is already enormous).
- **Losing the staked peg**: Is the peg simply removed from the board? What if that peg was the only thing blocking an opponent's win line?

#### 7d. Steal, Curse, Snipe, Double Down --- When Usable?

The SPEC lists these as Slot 4 rewards but never specifies **when they can be activated**:

- **Immediately after earning?** That would mean the Slot 4 flow is: answer correctly -> place peg -> earn special joker -> use special joker (optional) -> turn end.
- **On any future turn?** Store in inventory, use during a future Phase 1 or Phase 2.
- **During opponents' turns?** Some jokers (Curse) might make sense to use before an opponent's question selection.

The most implementable approach: special jokers are stored in inventory and usable during the owner's future turns, at the same phases as basic jokers. Steal/Snipe during Phase 1 (before choosing a question), Curse anytime (takes effect on the target's next turn), Double Down during Phase 1 (applies to the upcoming answer).

**Suggestion**: Define a joker timing table:

| Joker | Usable Phase | Target | Effect |
|-------|-------------|--------|--------|
| Reshuffle Selection | Phase 1 (question selection) | Self | Re-draw 4 questions |
| Reshuffle Question | Phase 2 (question display) | Self | Replace question |
| Reveal Hint | Phase 2 (question display) | Self | Show hint |
| The Gambler | Phase 1 (question selection) | Self | Stake peg, special question |
| Steal | Phase 1 (question selection) | Opponent | Take random peg from target |
| Curse | Phase 1 (question selection) | Opponent | Force hard difficulty on target's next turn |
| Snipe | Phase 1 (question selection) | Opponent + field | Remove specific peg |
| Double Down | Phase 1 (question selection) | Self | Next correct = 2 pegs |

---

### 8. Board Constraint Logic for Slots 2 and 3

The IDEA says Slots 2 and 3 reveal a constraint like "Column B / Row 3" and peg candidates are drawn from within that row or column. The SPEC does not clarify:

1. **Is the constraint a single row OR a single column?** The IDEA says "Column B / Row 3" --- the slash suggests it is one or the other (randomly chosen). Not both.

2. **Can both Slot 2 and Slot 3 have the same constraint?** If both are "Row 2," the player has two chances to place in the same row. This seems fine but should be stated.

3. **What if the constrained row/column has no empty fields?** The question cannot award a meaningful peg. The algorithm must exclude fully occupied rows/columns when generating constraints.

4. **Interaction with 2x boost**: If a 2x Slot 2 awards 2 pegs, both must be placed within the same row/column constraint. What if the row/column only has 1 empty field? Only 1 peg is placed? Or is the constraint relaxed for the second peg?

**Suggestion**: Add constraint selection rules: "For Slots 2 and 3, the game randomly selects either a row or column that contains at least [placement_candidates] empty fields (or at least 2 empty fields if 2x boost is active). If no row or column qualifies, fall back to Slot 1-style whole-board placement for that slot."

---

### 9. Starting Pegs --- Symmetry Algorithm

The IDEA says: "boards can be pre-populated with a configurable number of random pegs during setup. All players receive the same pattern, mirrored or rotated, so no player gets a positional advantage."

This is more complex than it sounds:

- **Symmetry group**: For a square board, there are 8 symmetries (4 rotations + 4 reflections). "Mirrored or rotated" suggests each player gets a transformation of the same base pattern. But with 6 players, you only have 8 distinct transformations. For 2-4 players, rotations alone (0, 90, 180, 270) suffice. For 5-6 players, you need reflections too, and some transformations will repeat.
- **Strictly identical**: An alternative is to give every player the exact same pattern (no transformation). This is simpler and equally fair. The IDEA says "mirrored or rotated," but if all boards are independently owned and the board has no inherent asymmetry (no labeled sides), rotation is irrelevant. Consider simplifying to "all players receive the identical starting pattern."
- **Algorithm**: Generate a random pattern of K pegs on a board_size x board_size grid. Ensure the pattern does not already complete a line (that would be an instant win). Ensure the pattern does not make a line trivially completable (e.g., board_size - 1 pegs already in a line). A reasonable constraint: no line should have more than floor(board_size / 2) pegs pre-filled.

**Suggestion**: Simplify to identical patterns (no rotation/mirroring) and add the constraint that no line may have more than `floor(board_size / 2)` starting pegs to preserve game balance.

---

### 10. Technology Stack --- Unspecified

The SPEC says the app must be "natively playable on tablets and smartphones" but never specifies the technology stack. This is a fundamental architecture decision:

- **Native (Swift + Kotlin)**: Best performance, best audio handling, best platform integration. Doubles the codebase.
- **React Native / Expo**: Single codebase, good for UI-heavy apps, adequate audio support with libraries. Probably the best fit for this type of app.
- **Flutter**: Single codebase, excellent animation support, good audio. Also a strong candidate.
- **Web app (PWA)**: Single codebase, universal deployment, but audio handling on mobile web is notoriously unreliable (autoplay restrictions, background audio issues, Safari quirks). Risky for a game that relies heavily on audio narration.

Given the requirements (shared device, audio narration, animation, offline corpus), **React Native or Flutter** are the most practical choices. A PWA would work for prototyping but may hit audio walls in production.

**Suggestion**: Add a "Technology Stack" section to the SPEC stating the chosen platform (or at minimum the constraints that narrow the choice) and the implications for audio handling, asset bundling, and offline support.

---

### 11. Game Persistence and Resume

The UX feedback (Section 9c above) correctly notes that the app should save game state aggressively. The SPEC does not address persistence at all.

**Required behaviors:**
- **Auto-save**: After every state transition (not just every turn), serialize the game session to local storage. This protects against app crashes, accidental closes, and device sleep.
- **Resume on launch**: If a saved game exists, the Start Screen should show a "Continue Game" button alongside "New Game."
- **Storage format**: JSON serialization of the GameSession object to local storage (AsyncStorage, SharedPreferences, or equivalent). For web, IndexedDB or localStorage.
- **Save corruption handling**: Validate the saved state on load. If corrupted, discard and show "New Game" only.

**Suggestion**: Add a "Game Persistence" section specifying auto-save triggers, storage mechanism, and resume flow.

---

### 12. Cross-Check: IDEA.md Mechanics vs. SPEC Implementation Coverage

| IDEA.md Mechanic | SPEC Section | Implementation Readiness | Notes |
|------------------|-------------|-------------------------|-------|
| Player setup (2-6, colors, expertise) | 5.2 | Implementable | Shape/pattern for accessibility mentioned in 4 but not in setup flow |
| Turn order (clockwise) | Implied | **Under-specified** | No explicit turn order model; "clockwise" is a physical metaphor --- for digital, just use array index cycling |
| 4-slot question structure | 5.4 | Partially implementable | Slot logic described, but selection algorithm missing (see section 3 above) |
| Expertise weighting | Not in SPEC | **Not implementable** | No weights or distribution defined |
| Board constraints (Slots 2/3) | 5.4, 5.8 | Partially implementable | Constraint generation algorithm missing (see section 8) |
| Free placement (Slot 4) | 5.8 | Implementable | Clear enough |
| Pass mechanic | 5.6, 5.7 | Partially implementable | "Previous round" ambiguous (see section 5) |
| 2x Catch-up boost | 5.4 | Partially implementable | Metric and slot eligibility undefined (see section 6) |
| Basic jokers (4 types) | 5.4, 5.5 | Partially implementable | Timing defined, but re-earning mechanism missing |
| Special jokers (4 types) | Not in screen flow | **Not implementable** | No activation timing, no target selection, no UI (see section 7d) |
| The Gambler | 5.4 | **Not implementable** | Too many undefined parameters (see section 7c) |
| Win condition (full line) | 5.9 | Implementable | Clear enough |
| Starting pegs | 5.2 | Partially implementable | Symmetry algorithm undefined (see section 9) |
| Board always visible | 7 | Implementable | Board viewer overlay defined |
| Question time limits | 5.5 | Implementable | Soft limit with visual/audio cues described |
| Special question types | 5.5 | Implementable | Sorting, map, calculation, audio all described |

---

### Summary of Critical Items

1. **Define the game state machine**: This is the single most important missing piece. Without it, the turn flow, joker interactions, and pass mechanic cannot be implemented consistently. Add a formal state diagram or table of states and transitions.

2. **Specify the game session data model**: Define the concrete schema for a running game (players, boards, jokers, turn state, history). This is as important as the question data format already in the SPEC.

3. **Document the question selection algorithm**: Expertise weighting, category diversity rules, constraint generation for Slots 2/3, depletion fallback, and special joker award rules all need explicit specification.

4. **Resolve joker system ambiguities**: When each joker is usable, re-earning mechanics for basic jokers, inventory model (counts vs. booleans), and full Gambler rules.

5. **Define "previous round player"**: Replace the ambiguous phrase with a precise definition and cover all edge cases (round 1, pass declined, multi-player scenarios).

6. **Specify the technology stack**: Native, React Native, Flutter, or web. This decision cascades into audio handling, asset bundling, and persistence strategy.

7. **Add game persistence**: Auto-save triggers, storage format, and resume flow. Essential for a shared-device game where accidental interruptions are frequent.

8. **Specify corpus loading strategy**: How the app indexes and queries the question corpus at runtime. Recommend a pre-built index file or SQLite database over runtime folder scanning.

---

## TTS & Audio Pipeline

### Overview

This review evaluates the SPEC from the perspective of TTS integration, audio asset management, voice line generation, and in-game audio playback. The spec's approach of pre-generating all voice lines offline and shipping them with the app is fundamentally sound --- it avoids runtime API dependencies, latency issues, and per-play costs. However, several areas need refinement around cost estimation, file structure, format choice, voice configuration, and playback engineering.

---

### 1. ElevenLabs Integration: Workflow, Costs, and Rate Limits

**Verdict**: The proposed workflow (generate voice lines as a post-step after question content creation) is practical and the right architecture. Decoupling content creation from TTS means a failed voice generation does not block question authoring, and voice lines can be regenerated independently if the voice or settings change.

#### Cost Estimation

ElevenLabs bills per character. A typical question involves:

| Voice line | Estimated characters | Per language |
|------------|---------------------|-------------|
| Teaser title | ~30 chars | 30 |
| Question text | ~150 chars | 150 |
| Answer options (4 options) | ~120 chars | 120 |
| **Total per question** | | **~300 chars** |

For a corpus of 1,000 questions in 2 languages: ~600,000 characters. At ElevenLabs Pro plan ($99/month, 500,000 characters included), that is roughly 1.2 months of quota for the initial corpus, or about $120. At Scale plan ($330/month, 2,000,000 characters), the full corpus fits within a single month with room to spare.

For 5,000 questions in 2 languages: ~3,000,000 characters. This requires the Scale plan for ~1.5 months, or about $500 total. Adding a third language multiplies proportionally.

**Suggestion**: The spec should include a `config/tts.yaml` or similar file that tracks generation costs per batch run, so operators can monitor spend. The pipeline CLI `generate` and `generate-batch` commands should log character counts consumed per run.

#### Rate Limits

ElevenLabs enforces concurrent request limits that vary by plan (typically 2--5 concurrent requests on Pro, higher on Scale/Enterprise). The `generate-batch` command mentions configurable concurrency for agent workers, but the TTS step has its own concurrency ceiling.

**Suggestion**: Add a separate `--tts-concurrency` flag (or config setting) for the TTS step, independent of the agent worker concurrency. Default to 2 to stay safe. Include retry logic with exponential backoff for 429 (rate limit) responses. The pipeline should also support `--skip-tts` to generate question content without voice lines, and a separate `quizthat tts-generate` command to generate/regenerate voice lines for existing questions.

#### Latency

ElevenLabs API latency for a short text (~30 chars) is typically 1--3 seconds; longer texts (~150 chars) take 2--5 seconds. For a single question with 3 voice lines per language and 2 languages, expect ~15--30 seconds of TTS generation time. For batch runs, this is the bottleneck, not the LLM agent.

**Suggestion**: Pipeline progress output (Section 2, Pipeline CLI) should show TTS as a distinct, timed stage. For batch runs, consider generating question content for all questions first, then running TTS as a parallel second pass over the batch --- this allows maximum TTS concurrency without competing with agent workers for resources.

---

### 2. Voice Line File Structure

The spec defines three audio files per language per question:

- `teaser.{lang}.mp3` --- teaser title readout
- `question.{lang}.mp3` --- full question text readout
- `answers.{lang}.mp3` --- all answer options read sequentially

**Problem: `answers.{lang}.mp3` as a single file is inflexible.** During gameplay (Section 5.5), the narrator reads each answer option, and players may want to tap an answer before the narrator finishes reading all four. With a single `answers.{lang}.mp3` file, the app would need to either:
1. Play the full file and block interaction until it finishes (bad UX --- players who read faster than the narrator are stuck waiting), or
2. Hard-cut the audio mid-sentence when the player taps (jarring), or
3. Ship timing metadata (start/end timestamps per option within the file) so the app can seek to specific options and stop cleanly between them.

None of these are as clean as splitting into per-option files.

**Suggestion**: Replace `answers.{lang}.mp3` with individual files:

```
audio/
  teaser.en.mp3
  question.en.mp3
  answer_0.en.mp3     # "Electromagnetic force"
  answer_1.en.mp3     # "Gravity"
  answer_2.en.mp3     # "Strong nuclear force"
  answer_3.en.mp3     # "Weak nuclear force"
```

This increases the file count from 3 to 6 per language but provides clean per-option playback control. The app can play options sequentially with small pauses, stop cleanly between options when the player taps, and replay individual options on demand (accessibility benefit). The additional TTS API calls are minimal --- each answer option is typically 10--30 characters. A single API call with SSML pauses between options is also possible, but then you still need timestamp metadata for seeking.

**File size impact**: At 64 kbps MP3, a 2-second answer option clip is ~16 KB. Four clips add ~64 KB per language vs. one combined file of ~64 KB. Negligible difference in total, but the per-file overhead (filesystem metadata, HTTP headers if streamed) is slightly higher.

---

### 3. Audio Format: MP3 vs. Opus

The spec says "MP3 or Opus, ~64--128 kbps." This needs a definitive choice.

#### Compatibility

| Format | iOS (native app) | iOS Safari (web) | Android | Desktop browsers |
|--------|-----------------|------------------|---------|-----------------|
| MP3 | Full support | Full support | Full support | Full support |
| Opus (in Ogg) | Via AVFoundation with extra work | Safari 18.4+ only (iOS 18.4+, mid-2025) | Full support | Chrome, Firefox, Edge: full |
| Opus (in WebM) | Limited | Safari 17+ | Full support | Full support |
| Opus (in MP4/M4A) | Full support | Safari 17+ | Full support | Full support |

Opus offers better quality-per-bit than MP3 (a 48 kbps Opus file sounds comparable to a 96 kbps MP3), but the container format matters significantly for compatibility. If the app targets web (progressive web app or browser-based), Opus in Ogg containers excludes older iOS Safari versions. If the app is a native app using platform audio APIs, Opus is fine on both platforms with the right container.

**Recommendation**: Use **MP3 at 64 kbps, 44.1 kHz mono** as the default format. Rationale:
- Universal compatibility across all platforms and deployment targets without container format concerns.
- 64 kbps mono is adequate for speech (voice lines are not music).
- ElevenLabs outputs MP3 natively at this bitrate (`mp3_44100_64` format specifier) --- no post-processing needed.
- File sizes are reasonable: a 10-second voice line at 64 kbps = ~80 KB.

If the corpus grows very large and storage becomes a concern, Opus at 48 kbps in MP4 containers could save ~30--40% space, but this optimization is premature. Start with MP3.

**Suggestion**: Specify the exact format in the spec: `mp3_44100_64` (mono, 44.1 kHz, 64 kbps). Add it to `config/voices.yaml` as a configurable `output_format` field so it can be changed later without code modifications.

---

### 4. Pre-Generated UI Voice Lines: Inventory and Scalability

Section 6 lists UI-level voice lines that ship with the app. Here is the concrete enumeration.

#### Line Count Estimation

**Turn transitions**: "Player [Color], your turn."
- 6 colors x N languages = 6 x 2 = **12 lines**

**Pass transitions**: "[Color], your chance!"
- 6 colors x 2 languages = **12 lines**

**Correct answer reactions**: "a few variations" --- assume 5 variations
- 5 x 2 languages = **10 lines**

**Incorrect answer reactions**: "a few variations" --- assume 5 variations
- 5 x 2 languages = **10 lines**

**Victory**: "[Color] wins!" + "Congratulations!" etc.
- 6 color-specific + 3 generic = 9 x 2 languages = **18 lines**

**Joker activations**: "Reshuffle!", "The Gambler!", "Snipe!", "Steal!", "Curse!", "Double Down!", "Reveal Hint!", "Reshuffle Question!"
- 8 jokers x 2 languages = **16 lines**

**Total**: ~78 voice lines for 2 languages. At ~300 characters total across all lines (most are very short, 5--15 chars each), this is roughly 1,500--2,000 characters of TTS --- negligible cost (under $0.50).

#### Scalability When Adding Languages

Adding a third language (e.g., French) adds ~39 more lines. The cost and effort scale linearly and remain minimal. The real work is selecting an appropriate voice for each new language and generating the files.

**Problem**: The spec does not address how player-specific lines (e.g., "Player Red, your turn") handle custom player names. The spec says players can enter names (Section 5.2) but the narrator says "Player [Color]" not "Player [Name]." This is correct for pre-generated lines --- you cannot pre-generate lines for arbitrary player names. But it creates a disconnect: the game shows "Jonas's Turn" on the Turn Gate while the narrator says "Player Red, your turn."

**Suggestion**: Either:
1. Accept the disconnect (narrator uses colors, UI uses names) and make it a deliberate design choice --- document it explicitly.
2. Use runtime TTS for player name lines only. ElevenLabs has a low-latency endpoint suitable for short phrases. A single "Jonas, your turn" line is ~20 chars and takes <1 second to generate. This adds an API dependency during gameplay, which conflicts with the offline-first approach.
3. Pre-generate name-specific lines during game setup. When players enter names, the app calls the TTS API to generate personalized turn/pass/victory lines. This requires an internet connection at game start but not during play. ~20 lines per player x 6 players = ~120 short lines, ~1,000 characters, <$0.10, takes ~30 seconds.

Option 1 is simplest and matches the game's color-centric identity design. Option 3 is a nice premium touch if internet connectivity is available.

---

### 5. Voice Configuration: Beyond `voice_id`

The spec's `config/voices.yaml` only stores `voice_id` and `name` per language. This is insufficient.

ElevenLabs exposes four generation parameters that significantly affect output quality:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `stability` | 0.50 | Higher = more consistent delivery; lower = more expressive/varied |
| `similarity_boost` | 0.75 | Higher = closer to original voice; lower = more creative latitude |
| `style` | 0.00 | Style exaggeration (increases latency, recommended to keep at 0) |
| `use_speaker_boost` | true | Enhances voice clarity (recommended for speaker playback) |

For a game narrator that should be "clear, engaging, and slightly dramatic" (per spec), the defaults are a reasonable starting point, but they need to be tunable per voice without code changes. Additionally, the `model_id` matters --- ElevenLabs offers `eleven_multilingual_v2` (best quality, 1 credit/char) and `eleven_turbo_v2_5` (faster, 0.5 credits/char, slightly lower quality).

**Suggestion**: Expand the voice config:

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

This makes voice tuning a config change, not a code change. Different languages may need different stability/similarity values depending on the selected voice.

---

### 6. Audio Questions (Listening Type) and Voice Line Sequencing

The spec mentions `assets/clip.mp3` for audio/listening questions (e.g., "Name this song from the first 10 seconds"). The question flow (Section 5.5) says: "Prominent play button with waveform visualization. Unlimited replays. 'Ready?' confirmation before first play."

**Problem: Sequencing between narrator and clip is unspecified.** The normal question flow is: narrator reads question text, then narrator reads answer options, then player answers. For an audio question, where does the clip play?

Proposed sequence:
1. Narrator reads the question text (e.g., "Name this song from the first 10 seconds")
2. "Ready?" confirmation button appears
3. Player taps "Ready?" --- clip plays
4. Clip ends --- answer options appear, narrator reads them
5. Player can replay the clip at any time via the play button

This sequencing needs to be explicitly defined in the spec. Additionally:

- **Clip format**: The spec says `clip.mp3` which is fine. Specify a maximum duration (e.g., 30 seconds) and bitrate (128 kbps stereo for music clips, since audio quality matters for recognition tasks).
- **Clip volume vs. narrator volume**: Music clips and voice lines may have very different loudness levels. The app needs per-category volume normalization or at minimum a consistent target loudness (e.g., -16 LUFS for voice, -14 LUFS for music clips). See Section 8 below.
- **Clip source**: The spec does not say where audio clips come from. Are they sourced by the agent during research? Manually curated? Licensed? This has legal implications (copyright for music identification questions). The generation pipeline section should address clip acquisition.

---

### 7. Skippable Narration: Technical Behavior

The spec says voice lines should be "skippable (tap to skip narration and go straight to interaction)." This needs precise definition.

#### Question Selection Screen (5.4)

The narrator reads all 4 teaser titles sequentially. If the player taps a card mid-narration:
- **Option A**: Immediately stop narration, select that card, proceed to Question Screen. (Fast but may feel abrupt.)
- **Option B**: Fade out current narration over ~200ms, then proceed. (Smoother.)
- **Option C**: Finish the current teaser title, then proceed. (Slower, may feel unresponsive.)

**Recommendation**: Option B (fast fade-out). 200ms is imperceptible as a delay but avoids the harsh audio cut of Option A. The player's intent is clear --- they tapped a card, they want to proceed.

#### Question Screen (5.5)

The narrator reads the question, then reads answer options. If the player taps an answer while the narrator is still reading:
- The player has made their choice. Stop narration (fade out), accept the answer, proceed to the result screen.
- Do NOT block interaction until narration finishes. Players who read faster than the narrator should never feel held hostage.

**Suggestion**: Add a "skip" icon (e.g., a forward arrow) in the corner of the screen during narration, as an explicit alternative to "tap an answer to implicitly skip." Some players may want to skip the narration but are not ready to answer yet. The skip button stops narration and enables answer selection without committing to an answer.

#### Implementation Detail

Audio playback should use a state machine:

```
IDLE -> PLAYING -> (tap) -> FADING_OUT -> IDLE
                -> (end) -> IDLE
```

The fade-out duration (200ms) should be a constant, not configurable. Use a linear gain ramp, not an exponential one, for such a short duration --- the difference is inaudible and linear is simpler to implement.

---

### 8. Social Environment Playback: Volume, Normalization, and Speaker Concerns

The spec says audio must "work reliably on tablet/phone speakers in a noisy social environment." This is a real engineering concern.

#### Volume Normalization

Voice lines from ElevenLabs will have variable loudness depending on the text content, language, and voice. Short exclamations ("Reshuffle!") will peak louder than long question readouts. Without normalization, players will constantly reach for the volume control.

**Suggestion**: Apply **loudness normalization** to all voice lines during the generation pipeline (not at runtime). Target -16 LUFS (integrated loudness) for all voice lines, which is the standard for spoken-word podcasts and a good fit for tablet speaker playback. Use `ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11` as a post-processing step after each TTS generation. This adds ~0.5 seconds per file to the pipeline but ensures consistent playback.

Add this as a pipeline step:
```
  ● Generating voice lines...   ElevenLabs API (en, de)
  ✔ Voice lines ready            6 files generated
  ● Normalizing audio...         loudnorm -16 LUFS
  ✔ Audio normalized             6 files processed
```

#### Sound Effects vs. Voice Lines

The spec mentions several sound effects: "celebratory animation/sound" (correct answer), "audio heartbeat increases in tempo" (time pressure), "satisfying drop animation" (peg placement). These sound effects are not covered by the voice line system. They need their own asset pipeline (likely hand-crafted, not TTS-generated) and their own volume control.

**Suggestion**: Add a dual volume control in settings:
- **Narrator volume**: Controls all voice line playback.
- **Sound effects volume**: Controls UI sounds, celebrations, heartbeat, etc.
- **Master volume**: Overall multiplier.

This is standard in games and prevents the situation where a player mutes narration to avoid spoiling a question for a nearby spectator but still wants the satisfying peg-drop sound.

#### Speaker Hardware

The UX review (Section 9e of the Mobile/Tablet UX feedback above) correctly identifies speaker orientation as a concern. From the audio engineering perspective:

- **Frequency response**: Tablet speakers typically roll off below 200--300 Hz. Voice lines should not rely on low-frequency content for clarity. ElevenLabs voices are predominantly mid-range, so this is not a major issue, but verify with the selected voices.
- **Stereo vs. mono**: Generate voice lines in **mono**. Stereo adds no value for speech and doubles file size. Tablets on a table have unpredictable speaker orientation relative to listeners --- stereo imaging is meaningless in this context.
- **Bluetooth/external speaker latency**: If players connect a Bluetooth speaker, there is typically 100--300ms of audio latency. This can cause visible desync between animations (peg placement, card reveal) and their accompanying sound effects. The app should not synchronize visual events to audio completion --- trigger them independently. Audio is supplementary, not gating.

---

### 9. Cross-Check Against IDEA.md: Audio-Relevant Coverage

| IDEA.md Mechanic | SPEC Audio Coverage | Gap |
|------------------|--------------------|----|
| Narrator reads teaser titles during selection | Section 5.4 and 6 cover this | OK |
| Narrator reads question + answer options | Section 5.5 and 6 cover this | OK, but answer splitting issue (see Section 2 above) |
| Audio/Listening question type (identify from clip) | Section 5.5 mentions play button + waveform | **Gap**: No sequencing spec for clip vs. narrator (see Section 6 above). No clip sourcing/licensing strategy. |
| Soft time limit audio (heartbeat) | Section 5.5 mentions "audio heartbeat increases in tempo" | **Gap**: No asset spec. Is this a pre-built sound effect loop? How does tempo increase work technically (pitch shift? crossfade between variants?)? |
| Correct/incorrect sounds | Section 5.6 mentions "animation/sound" | **Gap**: No sound effect asset list. These are not TTS --- they are SFX. Need their own pipeline. |
| Joker activation callouts | Section 6 lists them | OK |
| Victory sounds | Section 5.9 mentions "triumphant narrator voice line" | OK for voice. **Gap**: Victory SFX (confetti sound, fanfare) not specified. |
| Pass mechanic ("your chance!") | Section 6 lists pass transitions | OK |
| 2x Boost notification | Not in audio spec | **Gap**: Should there be an audio cue when a player receives the 2x boost? A short jingle or narrator callout ("Double points available!") would reinforce the UI badge. |
| Board constraint announcement (Slots 2/3) | Not in audio spec | **Minor gap**: The narrator could read the constraint ("Column B, Row 3") during question selection. This helps in a noisy social environment where players may not read the card details. Optional but valuable. |

---

### 10. Additional Recommendations

**10a. TTS provider abstraction.** The spec names ElevenLabs specifically, which is fine as the primary provider. But the pipeline should use a provider interface (e.g., `TTSProvider` with `generate(text, voice_config) -> AudioFile`) so that swapping to a different provider (Google Cloud TTS, Amazon Polly, Azure Speech, or a future provider) requires only a new adapter, not a pipeline rewrite. ElevenLabs pricing or quality may change; an abstraction costs almost nothing to implement upfront.

**10b. Voice line caching and deduplication.** Some answer options may appear across multiple questions (e.g., "True" / "False", common country names, etc.). The pipeline should hash the text + voice config and skip regeneration for identical lines, storing shared clips in a common pool and symlinking or referencing them. This saves both API cost and storage.

**10c. Voice line preview during generation.** The `quizthat generate` single-question CLI should offer a `--preview-audio` flag that plays back generated voice lines in the terminal (using `ffplay` or `aplay`) immediately after generation. This lets operators catch voice quality issues early without manually navigating to the output folder and opening files.

**10d. Corpus-wide audio statistics.** Add a `quizthat corpus audio-stats` command that reports: total audio file count, total size on disk, average duration per line type (teaser, question, answer), count of missing audio files (questions with content but no voice lines), and format consistency (all files match the configured format).

**10e. SSML support.** ElevenLabs supports SSML tags for controlling pronunciation, pauses, and emphasis. For question text that contains numbers, abbreviations, or foreign words, SSML can significantly improve readout quality. Example: `<say-as interpret-as="date">1492</say-as>` vs. "one thousand four hundred ninety-two" vs. "fourteen ninety-two." The question data schema should support an optional `question_text_ssml` field that overrides `question_text` for TTS generation. This is a low-priority enhancement but worth noting in the spec as a future option.

---

### Summary of Critical Items

1. **Split answer audio into per-option files** (`answer_0.en.mp3` ... `answer_3.en.mp3`): Enables clean playback interruption when a player taps an answer mid-narration.
2. **Standardize on MP3 64 kbps mono** (`mp3_44100_64`): Universal compatibility, adequate quality for speech, no format ambiguity.
3. **Expand voice config** to include `model_id`, `stability`, `similarity_boost`, `style`, `use_speaker_boost`, and `output_format` per language.
4. **Add loudness normalization** (-16 LUFS) as a post-processing step in the pipeline to ensure consistent volume across all voice lines.
5. **Define audio question sequencing**: narrator reads question, "Ready?" confirmation, clip plays, then answers appear.
6. **Specify skip behavior**: 200ms fade-out on tap, explicit skip button for skipping narration without committing to an answer.
7. **Add separate TTS concurrency control** and a `--skip-tts` / `quizthat tts-generate` command for decoupled voice line management.
8. **Specify a sound effects asset list** separate from voice lines: correct/incorrect sounds, heartbeat timer, peg drop, victory fanfare, joker activation SFX.
9. **Dual volume controls** in settings: narrator volume + SFX volume + master volume.

---

## LLM/Agent Pipeline

### Overview

This review evaluates the question generation pipeline (SPEC Section 2), the question data format (Section 3), and the voice line generation subsystem from the perspective of building a reliable, scalable, and quality-controlled AI content generation system. The spec describes an ambitious pipeline with many good design choices (folder-per-question structure, audit trails, corpus gap analysis). The issues below are implementation concerns that will directly impact question quality, pipeline reliability, and operational cost.

---

### 1. Claude Code SDK Integration --- Underspecified Architecture

**Problem: "Generic agent interface" is undefined.** The spec says "there should be a generic agent interface, but the primary implementation uses Claude Code SDK as the agent backend." This is the right instinct (abstracting the agent backend), but no interface contract is defined. Without specifying what the interface exposes --- start a run, stream events, get final output, handle errors, provide tools --- every consumer of the interface will make different assumptions, and swapping backends later becomes a rewrite.

**Suggestion**: Define the agent interface explicitly in the spec. At minimum it needs:
- `run(prompt, tools, config) -> AsyncIterator<Event>` --- starts an agent run and streams progress events
- Event types: `research_started`, `research_complete`, `question_constructed`, `validation_passed`, `validation_failed`, `error`
- Tool declarations the agent has access to (web search, file write, corpus read)
- Configuration: model, max turns, timeout, allowed tools

**Problem: Claude Code SDK invocation model is unclear.** "Invoking Claude Code runs programmatically" could mean several things: spawning a subprocess via `claude` CLI, using the TypeScript SDK's `Claude.code()` method, or using the API with tool-use directly. These have very different performance characteristics, error handling patterns, and concurrency models. The subprocess approach is simplest but hardest to control (output parsing, crash recovery). The SDK approach is cleanest but ties you to TypeScript/JavaScript. The raw API approach is most flexible but means reimplementing tool orchestration.

**Suggestion**: Commit to the Claude Code TypeScript SDK (`@anthropic-ai/claude-code`) as the primary implementation. It provides structured conversation management, tool registration, and event streaming. Specify this explicitly so the team knows what runtime is required (Node.js 18+).

---

### 2. Agent Workflow --- Research Phase Reliability

**Problem: Web search quality is uncontrolled.** The spec says the agent "performs a web search" but does not specify search strategy, source quality requirements, or how many searches the agent should conduct. In practice, a single web search often returns low-quality results (SEO spam, outdated pages, unreliable sources). The agent has no guidance on when research is "good enough" versus when it should search again with refined queries.

**Suggestion**: Define a research protocol in the agent's system prompt:
- Minimum 2 independent searches with different query formulations
- Source quality heuristic: prefer .edu, .gov, Wikipedia, established reference sites; deprioritize content farms, forums, and AI-generated content
- Cross-reference requirement: the core fact behind the correct answer must appear in at least 2 independent sources
- Maximum research budget: cap at 5 searches per question to control cost and latency

**Problem: Research grounding varies by question type.** Multiple-choice factual questions ("Which planet is largest?") are well-suited to web research. But some question types are poorly served:
- **Sorting questions** ("Order these rivers by length") require finding a single authoritative source with all items ranked, which is harder than finding individual facts
- **Audio/Listening questions** require sourcing audio clips, which web search cannot do
- **Map Location questions** require geographic coordinates, which the agent must extract and validate
- **Calculation questions** often rely on formulas rather than web-searchable facts

**Suggestion**: Define type-specific research strategies. For sorting questions, require the agent to find a definitive ranking source (not cobble rankings from separate pages). For audio questions, the pipeline will likely need a separate asset-sourcing step (licensed audio databases, public domain recordings) that is not agent-driven. For map questions, require the agent to output lat/lng coordinates and validate them against a geocoding API. For calculation questions, allow the agent to derive answers from formulas rather than requiring web sources, but mandate that the formula itself is cited.

---

### 3. Self-Validation --- Insufficient for Quality Assurance

**Problem: The agent validates its own work.** Step 4 says the agent "self-validates: checks that the correct answer is actually correct based on the research, ensures distractors are plausible but wrong, and verifies the difficulty is appropriate." Self-validation is inherently limited --- the same model that made an error is unlikely to catch that error on review. In LLM pipelines, self-validation catches formatting errors well but catches factual errors poorly (the model is biased toward confirming its own output).

**Suggestion**: Implement a two-model validation architecture:
1. **Generation model** (Claude, via Claude Code SDK) produces the question
2. **Validation model** (a separate Claude call, or even a different model) receives only the question + answer + research sources and independently verifies: (a) the correct answer is factually correct, (b) each distractor is definitively wrong, (c) no distractor could arguably also be correct. This second call should use a structured output schema that forces the validator to cite a specific source for its judgment on each answer option.

Additionally, add a **human review queue** for the pipeline. Not every question needs human review, but flag questions where the validator's confidence is low, the topic is controversial, or the difficulty classification is uncertain. The `corpus validate` command is a good start but should also support a `--flag-for-review` mode that marks questions needing human attention.

---

### 4. Difficulty Calibration --- The Hardest Problem

**Problem: No objective difficulty standard exists.** The spec says difficulty should be "calibrated consistently across all categories." But the agent has no mechanism to achieve this. Telling an LLM "make this hard" produces inconsistent results --- what the model considers "hard" depends on its training data, not on human player populations. A "hard" geography question and a "hard" science question may differ wildly in actual difficulty.

**Suggestion**: Define difficulty as a set of concrete, measurable criteria rather than subjective labels:
- **Easy**: The answer is widely known general knowledge; distractors are clearly implausible to most adults
- **Medium**: The answer requires topic familiarity; at least 2 distractors are plausible to a non-expert
- **Hard**: The answer requires specific domain knowledge; all 4 options are plausible to a non-expert
- **Very Hard**: The answer requires deep expertise; distractors include common misconceptions that even knowledgeable people fall for

Include these criteria in the agent's system prompt. More importantly, build a **post-hoc difficulty calibration** system: after the corpus reaches a few hundred questions, run a small human playtesting sample (even 10--20 testers) and measure actual accuracy rates per difficulty level. Use this to retag questions whose actual difficulty diverges from their assigned level. The `corpus validate` command should support `--recalibrate-difficulty` based on playtest data.

---

### 5. Duplicate Detection --- Practical Implementation Gaps

**Problem: Embedding model and index not specified.** The spec says "embedding cosine similarity, threshold >0.85 = likely duplicate" but does not specify which embedding model, where the vector index lives, or how it is updated.

**Suggestion**: Specify:
- **Embedding model**: Use a sentence embedding model (e.g., `text-embedding-3-small` from OpenAI, or an open-source alternative like `all-MiniLM-L6-v2` via a local inference server). The choice affects quality and operational complexity --- a cloud API is simpler but adds a dependency; a local model is free but requires setup.
- **Index storage**: For a corpus target of thousands to tens of thousands of questions, a simple flat JSON file with pre-computed embeddings (one per question) is sufficient. No need for a vector database at this scale. On each generation run, load all embeddings into memory, compute cosine similarity against the new question, and reject if above threshold.
- **What gets embedded**: Embed the `question_text` field, not the teaser title or answers. The question text is what determines semantic overlap. Consider also embedding a concatenation of `question_text + correct_answer` to catch cases where two questions ask different things but converge on the same answer (e.g., "What is the capital of France?" vs. "Where is the Eiffel Tower located?").

**Problem: 0.85 threshold is arbitrary.** Cosine similarity thresholds vary significantly by embedding model and text domain. 0.85 might be too aggressive (rejecting legitimately different questions about related topics) or too loose (allowing near-duplicates through).

**Suggestion**: Calibrate the threshold empirically before committing to a number. Generate 50 question pairs (25 near-duplicates, 25 same-topic-but-different) and find the threshold that best separates them. Log the similarity score in `generation/log.json` for every question so the threshold can be tuned later. Add a `--similarity-threshold` flag to `generate` and `generate-batch` to allow per-run overrides during calibration.

---

### 6. Multilingual Generation --- Native vs. Parallel

**Problem: The spec says questions are "generated natively per language" (Section 1) but the agent workflow (Section 2) describes a single pipeline that receives a "target language" as input.** These are in tension. "Generated natively" implies the agent researches and writes each language variant independently. But the workflow implies the agent runs once and produces one language at a time. What actually happens when `--languages en,de` is passed?

There are two viable approaches:
1. **Parallel independent generation**: Run the agent separately for each language. Each run researches in that language and produces a fully independent question. Pro: truly native phrasing. Con: the English and German versions of "the same question" may diverge (different facts, different distractors) and feel like different questions entirely. Also doubles agent cost and runtime.
2. **Generate-then-adapt**: Run the agent once to research and construct the question in a primary language (e.g., English), then in a second pass, have the agent (or a lighter model) produce the other language variants using the same facts and answer structure. Pro: consistent question identity across languages. Con: the secondary language may feel translated, not native.

**Suggestion**: Use approach 2 (generate-then-adapt) but be specific about the adaptation step. The adaptation agent should receive the question structure (question text, all answer options, hint, teaser) plus the research sources, and produce a native-language version that preserves the factual content and answer structure but uses natural phrasing for that language. This is not machine translation --- it is constrained rewriting with access to sources. Log which language was the primary generation language in `meta.json` so this is auditable.

---

### 7. Teaser Title and Hint Quality --- No Validation Criteria

**Problem: Teaser titles must "hint at the topic without revealing the actual question."** This is a narrow quality band that LLMs struggle with. Too vague ("A Tricky Question") is useless for player decision-making. Too specific ("The Longest River in Africa") gives away the answer. The spec provides one example ("What Falls Up?") but no criteria for what makes a good teaser.

**Suggestion**: Define teaser quality criteria in the agent prompt:
- Must reference the topic domain (so the player knows what area the question is about)
- Must not contain the answer or any answer option
- Must not narrow the answer space to fewer than 3 plausible responses
- Should be evocative/dramatic (matching the game's tone)
- Maximum 5 words

Add a validation step: after generating the teaser, have the validator model attempt to guess the correct answer from the teaser alone. If it can, the teaser is too revealing.

**Problem: Hints have the same quality band issue.** Too vague ("Think about history") is not worth a joker. Too specific ("The answer rhymes with 'Havity'") gives it away. The spec says nothing about hint quality standards.

**Suggestion**: Define hint quality criteria:
- Must eliminate at least 1 distractor but not more than 2
- Must not directly state or phonetically hint at the correct answer
- Should reference a well-known association, mnemonic, or context clue

Validate by having the validator model rate how many distractors the hint eliminates. If it eliminates 0 or all 3, regenerate.

---

### 8. Question Types --- Varying Generation Difficulty

**Problem: The spec treats all question types uniformly in the pipeline, but they have very different generation requirements.**

| Type | Generation Complexity | Key Challenge |
|------|----------------------|---------------|
| Multiple Choice | Low | Distractor quality |
| Sorting | Medium | Need a verifiable total ordering of 4+ items; partial orderings are invalid |
| Map Location | Medium | Need precise coordinates; need to define scoring radii |
| Calculation | Medium | Need a problem with a single unambiguous numeric answer; need to verify the computation |
| Audio/Listening | High | Need to source or reference an audio asset that cannot be auto-generated by the text pipeline |

**Audio/Listening questions are a pipeline gap.** The current agent workflow produces text and metadata. Audio questions require an actual audio clip (e.g., 10 seconds of a song). The agent cannot produce this. The spec says nothing about how audio assets are sourced, licensed, or integrated.

**Suggestion**: Either (a) defer audio questions to a separate manual curation workflow and exclude them from the automated pipeline, or (b) define an audio asset pipeline: the agent specifies the asset needed (song title, timestamp range), a separate tool checks a licensed audio library, extracts the clip, and places it in the `assets/` folder. Option (a) is more realistic for an initial release.

**Sorting questions need extra validation.** The agent must produce a total ordering that is objectively correct. "Sort these countries by area" is verifiable. "Sort these movies by quality" is not. The validation step must confirm the ordering against a source, not just confirm the items are real.

**Suggestion**: For sorting questions, require the agent to cite a specific source for the ordering metric and include the actual numeric values (e.g., areas in km2) in `generation/research.md`. The validator checks these values against the claimed ordering.

**Map Location questions need a scoring schema.** The spec (question.json) does not define how map answers are stored. What goes in `answer_data` for a map question? Presumably lat/lng coordinates plus scoring radii, but this is not specified.

**Suggestion**: Define the `answer_data` schema for each question type:
```json
// Map location
{
  "target": { "lat": 48.8566, "lng": 2.3522 },
  "scoring": [
    { "radius_km": 50, "label": "exact" },
    { "radius_km": 200, "label": "close" },
    { "radius_km": 500, "label": "region" }
  ]
}

// Sorting
{
  "items": ["Nile", "Amazon", "Yangtze", "Mississippi"],
  "correct_order": [0, 1, 2, 3],
  "metric": "length in km"
}

// Calculation
{
  "correct_value": 299792458,
  "tolerance": 0.01,
  "unit": "m/s"
}
```

---

### 9. Batch Generation --- Concurrency and Cost

**Problem: "Multiple agent workers in parallel" with no concurrency design.** The spec mentions configurable concurrency for batch generation but does not address: Claude API rate limits, ElevenLabs API rate limits, filesystem contention on the corpus directory, or how to handle partial batch failures.

**Practical constraints**:
- Claude Code SDK / Claude API: rate limits vary by tier but are typically 50--100 requests/minute for Claude Sonnet, lower for Opus. Each question generation involves multiple API calls (research tool calls, construction, validation). A single question may consume 5--15 API calls across the agent conversation. At 10 concurrent workers, that is 50--150 API calls in flight.
- ElevenLabs: Free tier allows 10,000 characters/month. Pro tier is higher but still rate-limited. Each question generates ~6 voice lines across 2 languages. At 50 questions, that is 300 audio files.
- Embedding API (if using a cloud embedding model): additional rate limit concern.

**Suggestion**:
- Default concurrency to 3--5 workers, not higher, and make it tunable via `--concurrency`
- Implement per-API rate limiters (token bucket or leaky bucket) that are shared across all workers
- Voice line generation should be a separate batch step that runs after all question text is generated, not interleaved. This allows the text pipeline to run at full speed and the voice pipeline to respect its own rate limits independently. Add a `--skip-voice` flag to `generate-batch` for text-only runs.
- On partial failure, save completed questions and log failures. Add a `generate-batch --retry-failed <batch-id>` mode that picks up where the batch left off.

**Problem: Cost estimation is missing.** Generating 15,000+ questions (to cover 13 categories x 4 difficulties x multiple subcategories) is a significant API expense. A single question might cost $0.05--0.50 in API calls depending on model choice and conversation length. At 15,000 questions, that is $750--$7,500 for text alone, plus ElevenLabs costs for voice.

**Suggestion**: Add a `--estimate-cost` flag to `generate-batch` that calculates approximate API cost based on the number of questions, target languages, and voice generation. Require explicit confirmation before starting batches over a configurable cost threshold (e.g., $50).

---

### 10. Audit Trail --- Good but Incomplete

The `generation/` folder with `research.md`, `prompt.md`, and `log.json` is a strong foundation for debugging. Two gaps:

**Problem: No versioning for regenerated questions.** If a question fails validation and is regenerated, or if a human editor requests a revision, the original version is overwritten. There is no history.

**Suggestion**: Store a `generation/history/` subfolder with timestamped snapshots of previous versions. Alternatively, use a simple version counter in `meta.json` (already present as `"version": 1`) and keep `generation/log.json` as an append-only array of generation events rather than a single object.

**Problem: The prompt used is recorded, but model configuration is not fully specified.** `log.json` should include: model ID, model version/snapshot, temperature, max tokens, the system prompt hash or version, and the SDK version. This is essential for reproducibility --- if question quality degrades, you need to know whether the model or the prompt changed.

**Suggestion**: Extend the `log.json` schema:
```json
{
  "model": "claude-sonnet-4-20250514",
  "sdk_version": "1.2.3",
  "system_prompt_hash": "sha256:abc123...",
  "temperature": 1.0,
  "timestamp": "2026-02-28T12:00:00Z",
  "batch_id": "batch-2026-02-28-001",
  "duration_seconds": 45,
  "api_calls": 8,
  "estimated_cost_usd": 0.12,
  "validation_result": "passed",
  "similarity_score": 0.42,
  "primary_language": "en"
}
```

---

### 11. Missing Pipeline Feature: Corpus Quality Dashboard

The `corpus stats` and `corpus gaps` commands are useful but purely quantitative (counts by bucket). There is no mechanism for tracking **quality** across the corpus.

**Suggestion**: Add `quizthat corpus quality` that reports:
- Questions flagged during validation (low confidence, controversial topics)
- Questions with high similarity scores to other questions (near-duplicate clusters)
- Distribution of generation dates (old questions may reference outdated facts)
- Questions that have never been human-reviewed
- Average generation cost and duration trends (to detect prompt regression)

This becomes essential once the corpus exceeds a few hundred questions and manual inspection is no longer feasible.

---

### 12. Missing Pipeline Feature: Question Retirement and Updates

The spec describes question generation but not question lifecycle management. Facts change --- a "current president" question becomes wrong after an election. A "largest company by market cap" question may have a different answer next quarter.

**Suggestion**: Add:
- A `quizthat corpus refresh --older-than 6m` command that re-validates questions older than a threshold by re-researching the core facts
- A `retired` flag in `meta.json` for questions that are no longer factually correct, with a reason field
- A `quizthat corpus retire <question-id> --reason "outdated"` command
- The game app should respect the `retired` flag and exclude those questions at runtime

---

### 13. Cross-Check Against IDEA.md

| IDEA.md Feature | Pipeline Coverage | Gap |
|-----------------|-------------------|-----|
| 13 major categories + subcategories | Agent receives category/subcategory as input | **Gap**: No defined subcategory list. The pipeline cannot target gaps in subcategories that are not enumerated. Define the full taxonomy as a config file (`config/categories.yaml`) that the pipeline, corpus commands, and game all share as a single source of truth. |
| 4 difficulty levels | Agent receives difficulty as input | **Gap**: No calibration mechanism (see Section 4 above) |
| Multiple choice (4 options) | Covered | OK |
| Sorting questions | Not specifically addressed in pipeline | **Gap**: No type-specific generation or validation logic (see Section 8) |
| Map Location questions | Not specifically addressed in pipeline | **Gap**: No answer schema, no coordinate validation (see Section 8) |
| Calculation questions | Not specifically addressed in pipeline | **Gap**: No numeric answer schema, no computation verification (see Section 8) |
| Audio/Listening questions | Not addressed in pipeline | **Critical gap**: Pipeline cannot source audio assets (see Section 8) |
| Expertise-weighted question selection | Not pipeline concern | N/A (game runtime) |
| Questions available in multiple languages | Covered via `--languages` flag | **Gap**: Unclear whether generation is parallel or adapt (see Section 6) |
| Time limit per question | `meta.json` has `time_limit_seconds` | OK, but agent needs guidance on when to set a time limit vs. null |

---

### Summary of Critical Items

1. **Define the agent interface contract**: Specify the async interface, event types, tool declarations, and error handling so the pipeline is not coupled to Claude Code SDK internals.
2. **Replace self-validation with two-model validation**: The generating model should not be the sole validator. Use a separate validation call with structured output.
3. **Define difficulty as measurable criteria**: Subjective labels produce inconsistent results. Provide concrete distractor-plausibility rules per level and plan for post-hoc calibration with playtest data.
4. **Specify the multilingual generation strategy**: Choose between parallel-independent or generate-then-adapt and document the trade-offs. Generate-then-adapt is recommended.
5. **Address audio/listening questions explicitly**: Either exclude them from the automated pipeline or define an asset-sourcing workflow.
6. **Define `answer_data` schemas for all question types**: The spec only shows the multiple-choice schema. Sorting, map, and calculation types need their own schemas.
7. **Specify embedding model, index strategy, and threshold calibration plan**: The duplicate detection system cannot be built without these decisions.
8. **Decouple voice generation from text generation in batch mode**: Run them as separate steps to respect independent rate limits and allow text-only iteration.
9. **Add cost estimation and confirmation to batch generation**: Generating thousands of questions is expensive. The operator needs visibility before committing.
10. **Define the category/subcategory taxonomy as a shared config file**: The pipeline, corpus commands, and game app all need the same source of truth.
