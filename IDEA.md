# QuizThat!

A multiplayer quiz game for mobile and web, designed to fix common frustrations with existing quiz games — namely being forced into categories you know nothing about, and wildly inconsistent difficulty across topics.

## Core Philosophy

- Players should never feel like they have a 0% chance from the start. The expertise system gives everyone a foothold.
- Difficulty should be consistent across categories, not dumbed down for mass appeal in certain topics.
- Risk and reward should be tightly coupled — safe plays advance you slowly, bold plays can leap ahead or backfire.

## Game Setup

- **Player count**: 2–6 players. Players share a single device (e.g. a tablet placed in the center).
- **Player identity**: Each player picks a **color**. The game refers to them by color throughout (e.g. "Player Red has won").
- **Expertise selection**: Each player selects up to 2 **major categories** and up to 2 **specific subcategories** they feel strongest in. Expertise questions are drawn from these with a weighted probability favoring the specific subcategories.
- **Board size**: Always 4x4. A full line — 4 pegs — is required to win. The grid is deliberately not configurable: a fixed size keeps the win condition, the placement constraints and the worth of a single peg comparable between games. Game length is varied through starting pegs instead.
- **Starting pegs**: Boards can be **pre-populated** with a configurable number of random pegs during setup. This is the game's only length dial, since the board size is fixed. All players receive the **same pattern**, mirrored or rotated, so no player gets a positional advantage from the pre-population.
- **Placement candidates**: Configurable (1–4). Controls how many candidate fields the game offers when placing a peg (see Peg Placement Rules). At 1, placement is purely random (no choice). At 2–4, the player picks from that many randomly selected candidates. This dial controls the balance between luck and strategy — lower values for a more luck-based game, higher values for more player control.

## Question Categories

Categories follow a **tiered system** with major categories and subcategories:

| Major Category | Example Subcategories |
|----------------|----------------------|
| History | Ancients, Middle Ages, Recent History, ... |
| Geography | Countries, Capitals, Physical Geography, ... |
| Science | Physics, Chemistry, Biology, ... |
| Nature | Animals, Plants, Ecology, ... |
| Technology | Computing, Engineering, Inventions, ... |
| Sports | Football, Olympics, Motorsport, ... |
| Music | Classical, Pop/Rock, Instruments, ... |
| Literature | Novels, Poetry, Authors, ... |
| Art | Painting, Sculpture, Architecture, ... |
| Food & Drink | Cuisine, Beverages, Cooking, ... |
| Politics | World Politics, Ideologies, Elections, ... |
| Language | Etymology, Grammar, Linguistics, ... |
| Pop Culture | Film & TV, Celebrities, Internet, Video Games, ... |

Subcategories are the atomic unit for question tagging. Major categories group them for the expertise selection and display.

## Turn Structure

Players take turns in clockwise order. Each turn has two phases:

### Phase 1: Question Selection

The player is presented with **4 question options**, each shown as an **ominous title** — a hint at the topic without revealing the actual question. The four slots follow a fixed structure:

| Slot | Source | Difficulty | Reward | Placement |
|------|--------|------------|--------|-----------|
| 1 | Player's expertise categories | Any | Low | Pick from N candidates anywhere on the board |
| 2 | Random category | Random | Medium | Pick from N candidates within a revealed row or column |
| 3 | Random category | Random | Medium | Pick from N candidates within a revealed row or column |
| 4 | Random category | Hard or Very Hard | High + guaranteed joker | **Free placement** — any empty field |

For slots 2 and 3, the selection screen shows the constraint (e.g. "B,3") meaning the peg candidates are drawn from column B or row 3. N is the configured placement candidates setting (1–4).

### Phase 2: Answer the Question

The player answers the selected question. Correct answers award pegs according to the slot's reward rules.

**Wrong answers**: No penalty, but the question passes to the player who **answered in the previous round** (one round behind the current player). That player gets the opportunity to answer the same question for a **reduced reward** — always a single random peg anywhere on the board (Slot 1-style placement, regardless of which slot the original question came from). The correct answer is **not revealed** until the second player has also answered (or declined). This keeps the previous-round player engaged and attentive during the current turn.

## Win Condition — The Bingo Board

Each player has their own 4x4 bingo board. Columns are labeled with letters, rows with numbers (e.g. field "A3").

A player wins by completing a **full line** of pegs — horizontal, vertical, or diagonal.

All boards are **always visible** to all players — this enables strategic use of jokers like Steal and Snipe. The long-term vision includes physical board+peg sets that players have in front of them, with the digital board as a mirror.

### Peg Placement Rules

Peg placement always selects from **empty fields only** — a peg can never be wasted on a filled space. The number of **candidates** shown to the player is configurable in the game setup (1–4). When set to 1, placement is automatic (pure random, no player choice). When set to 2–4, the game highlights that many randomly selected empty fields and the player picks one.

This creates a clean **control gradient** across slots — Slot 1 is easiest but offers the least placement control, while Slot 4 is hardest but offers full placement freedom:

| Question Slot | Candidate Pool | Player Choice |
|---------------|---------------|---------------|
| Slot 1 (Expertise) | N random empty fields from the **entire board** | Player picks one (or auto-placed if N=1) |
| Slot 2 & 3 (Standard) | N random empty fields within the **revealed row or column** | Player picks one (or auto-placed if N=1) |
| Slot 4 (Hard/Very Hard) | **Free placement** — player places the peg on any empty field of their choice | Full control, no randomness |

If there are fewer empty fields available (in the constraint area or on the board) than the configured candidate count, all available empty fields are shown.

## Catch-Up Mechanic: 2x Boost

The **"2x" multiplier** is assigned per card, not to a fixed number of slots. Every player has a **low base chance (~8% per card)** in every round, so a 2x can surprise anyone. Starting from **round 3**, the player who has answered the **fewest questions correctly** so far has that chance raised sharply to **~35% per card** — this raised rate is what carries the catch-up.

If the player selects a 2x question and answers it correctly, they receive **2 pegs** instead of 1, placed according to that slot's normal placement rules (e.g. 2x on a Slot 2/3 question means 2 pegs within the revealed row/column).

This gives trailing players an active incentive to take risks and a tangible path to catch up, without punishing the leading player. Keeping 2x rare for everyone else means seeing one is an event rather than routine.

In case of a tie for fewest correct answers, all tied players receive the raised chance.

## Joker System

### Starting Jokers

Every player begins with **4 jokers**, one of each type. Jokers are **one-time use**, but spent jokers can be re-earned through gameplay (e.g. as a reward from hard questions).

1. **Reshuffle Selection** — Discard the current 4 question options and draw 4 new ones (usable during Phase 1).
2. **Reshuffle Question** — Replace the current question with a different one from the same category (usable during Phase 2).
3. **Reveal Hint** — Show a hint for the current question (usable during Phase 2).
4. **The Gambler** — Stake a random peg you already own. Receive a completely unpredictable question. If answered correctly, gain 3 random pegs. If wrong, lose the staked peg. **Requires at least one peg to use.**

### Joker Usage Rules

- **Multiple jokers per turn**: Allowed, but not of the same type in a single turn.

### Joker Awards — the bait

A slot that awards a joker is marked with a **JOKER** chip, and the joker is granted **the moment that slot is selected** — before the question is even shown, and regardless of whether it is answered correctly. Only the peg is at stake.

Which slots can carry it:

| Slot | Joker chip |
|------|-----------|
| 1 — Expertise | **Never** |
| 2 — Standard | ~35% chance |
| 3 — Standard | ~35% chance |
| 4 — Hard/Very Hard | **Always** |

The expertise slot never carries one on purpose: the chip exists to **lure a player away from their safe pick**. Because the reward is guaranteed on selection, taking the bait is a real temptation — you bank a joker either way, and only risk the peg.

The joker awarded is drawn at random from **all eight types**, basic or special.

### Special Jokers

The four aggressive, board-affecting jokers, awarded through the mechanic above:

- **Steal** — Take a random peg from another player's board.
- **Curse** — Force another player's next question to be "Hard" difficulty regardless of their slot selection.
- **Snipe** — Choose a specific field on an opponent's board to remove their peg (targeted, unlike Steal's randomness).
- **Double Down** — Your next correct answer awards 2 pegs instead of 1.

### Additional Joker Acquisition

A secondary mechanic for earning jokers beyond hard-question rewards is planned but not yet defined.

## Question Design

### Difficulties

All questions are classified into 4 levels:

| Difficulty | Description |
|------------|-------------|
| Easy | Approachable for most players |
| Medium | Requires solid knowledge of the topic |
| Hard | Challenging even for knowledgeable players |
| Very Hard | Expert-level; high risk, high reward |

Difficulty should be **calibrated consistently across all categories** — a "Hard" history question should feel comparably difficult to a "Hard" science question.

### Question Types

The majority of questions are standard **multiple choice** (always 4 options), but the system should support special question formats:

- **Sorting** — Arrange items in the correct order by a given metric (e.g. "Sort these rivers by length").
- **Map Location** — Pin a location on a map (natural fit for geography, but also cross-category: "Where was paper invented?").
- **Calculation** — Solve a math or science problem (e.g. "What is the orbital period of...?").
- **Audio/Listening** — Identify something from an audio clip (e.g. "Name this song from the first 10 seconds").

### Time Limits

Time limits are **per-question metadata**, not global. Most multiple-choice questions have no time limit, but question types where players could spend indefinitely (e.g. calculations) should specify a soft time limit. "Soft" means the game signals urgency to the player (visual/audio cue) but does **not** auto-fail the question.

### Question Corpus

Questions are **AI-generated but pre-generated**. A large corpus of questions is embedded in the game and drawn from at game time. On the backend/management side, a pipeline using an LLM will generate and curate questions in bulk.

## Open Questions

- How exactly should the secondary joker acquisition mechanic work?
- Exact subcategory lists for each major category.
- Weighted probability distribution for expertise questions (major vs. specific category draw rates).
- Physical board integration details.
