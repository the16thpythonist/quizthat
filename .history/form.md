# QuizThat! — Open Design Questions

The game concept is solid, but there are a number of design decisions that need pinning down before implementation can start. Write your answers in the `>` blockquotes below each question. Feel free to write as much or as little as you like — even "not sure yet, skip" is fine.

---

## Players & Setup

### 1. How many players should the game support?

What's the minimum and maximum player count? Two feels like a natural minimum, but the max matters for UI layout and turn pacing.

- A) 2–4 players
- B) 2–6 players
- C) 2–8 players (party mode)

> 2-6 players

---

### 2. How many expertise categories can each player select?

Too few and the expertise system barely matters; too many and slot 1 becomes trivially easy to exploit.

- A) Exactly 1 category
- B) Exactly 2 categories
- C) 1–3 categories (player's choice)
- D) Scales with number of total categories (e.g. pick up to 25% of them)

> 1-3 players choice

---

### 3. What are the question categories?

List the categories you want in the game. For reference, common quiz categories include: History, Geography, Science & Nature, Technology, Sports, Music, Film & TV, Literature, Art, Food & Drink, Politics, Language, Mathematics, Pop Culture, Video Games, etc.

> History, Geography, Science, Nature, Technology, Sports, Music, Literature, Art, Food & Drink, Politics, Language, Pop Culture.
> But it want it to be a tiered category system where every category has subcategories, so Science obviously would have subcategories like Physics, Mathematics, Chemistry and so on but in the same manner Pop Culture would hav subs like Film and TV, Celebrities, Internet, Drink and Food. Then History would be Ancients, Middle Ages, Recent History and stuff like that.
> I Think when selecting expertise categories it would make sense that someone could select up to two "major" categories and up to two "specific" categories which they feel even stronger in and then the expertise question has certain likelihoods to choose either from the major or minor categories.

---

## Board & Win Condition

### 4. On a 4x4 board, a line is 4 pegs. On 5x5 it's 5. Should there be a shorter win condition?

Completing a full line of 5 could take a very long time with random placement. Some options:

- A) Full line required (4 on 4x4, 5 on 5x5) — keep it as designed
- B) Allow a "short game" mode where you only need e.g. 3-in-a-row on a 4x4 or 4-in-a-row on a 5x5
- C) Always require 4-in-a-row regardless of board size (on 5x5 this means more possible lines)

> No, this is specifically intended if you want to play a longer game. If you want the game to be shorter you just choose 4x4
> But actually add the possibility of doing a 3x3 field as well.

---

### 5. What happens when a peg is awarded to a row/column where all fields are already filled?

For slot 2/3, the peg goes into a specific row or column. If all fields there are already taken, should anything happen?

- A) The peg is simply lost — bad luck, choose more strategically next time
- B) The player gets to pick any adjacent row/column instead
- C) The peg overflows to a completely random empty field (like slot 1 behavior)
- D) The player gets to re-roll once

> Fundamentally, the random mechanism should choose only between the "empty" fields - so this is something tha can never happen...

---

### 6. Should other players be able to see each other's boards?

This affects strategy significantly — if boards are visible, players can use Steal/Curse jokers tactically.

- A) Always visible to everyone
- B) Hidden by default, but players can spend a joker to peek
- C) Always hidden — jokers that target enemies work blindly

> The boards should be completely visible. In the final version of the game the idea is also that you play it in person and that every player acutally has the board and the pegs in front of them physically, but they should also be prominently featured and represented digitally in the game.

---

## Jokers & Special Mechanics

### 7. Are the 4 starting jokers one-time use, or do they recharge somehow?

- A) Strictly one-time use per game — once spent, gone forever
- B) One-time use, but you can earn duplicates through gameplay (e.g. special joker rewards)
- C) They recharge every N rounds
- D) Something else?

> One time use. But they can recharge for instance when they are gained from answering the hard question.

---

### 8. Should "The Gambler" joker be usable when you have zero pegs?

If the player has no pegs to stake, the risk/reward is broken — there's nothing to lose.

- A) Can't use it with zero pegs — you need something at stake
- B) Can use it, but the penalty becomes something else (e.g. skip next turn, lose a joker)
- C) Can use it freely with zero pegs — it's an early-game lifeline

> You need something to stake.

---

### 9. Can multiple jokers be used in the same turn?

For example, using "Reveal Hint" and then still having the option to "Reshuffle Question" if the hint wasn't helpful enough.

- A) Only one joker per turn
- B) Multiple jokers allowed, but not of the same type
- C) Any combination is fine — if you want to burn them all at once, go ahead

> B)

---

### 10. What additional special jokers (earned from Slot 4) should exist beyond Steal and Curse?

Here are a few proposals. Mark which ones you like, modify them, or add your own.

- A) **Shield** — Protect one of your pegs from being stolen for the rest of the game
- B) **Swap** — Swap one of your pegs with one of an opponent's pegs (both change boards)
- C) **Snipe** — Choose a specific field on an opponent's board to remove (instead of random like Steal)
- D) **Double Down** — Your next correct answer awards 2 pegs instead of 1
- E) **Freebie** — Place a peg anywhere on your board without answering a question

Your ideas:
 
> I like Snipe and Double down. I think this would be good for now. 

---

## Questions & Content

### 11. Should there be a time limit for answering questions?

- A) No time limit — take as long as you want (casual/party vibe)
- B) Generous time limit (e.g. 30–60 seconds) — keeps the game moving
- C) Time limit varies by difficulty (e.g. Easy: 15s, Medium: 30s, Hard: 45s, Very Hard: 60s)
- D) Time limit is configurable in game setup

> For some questions there should be a time limit. I think for the multiple choice not. But if the question in math would be something like "sovle this equation" that is something that people can spend a lot of time on. There should be a time limit then.
> So in general we need to support at least the possibility of having a time limit. This would be specified on a per question basis ( question metadata )
> The time limit would also be soft. Not that the question auto fails afterwards but that we give an indication to the player that they really have to give their answer now.

---

### 12. For multiple choice questions, how many answer options?

- A) Always 4 options
- B) Varies by difficulty — 4 for Easy/Medium, 5 or 6 for Hard/Very Hard
- C) Configurable

> always 4
 
---

### 13. Where should the question content come from?

This is a big one — it affects the entire architecture. The game needs hundreds or thousands of questions across all categories and difficulties.

- A) Bundled question packs — curated and shipped with the game
- B) Community-contributed — players can submit questions, with a review/moderation system
- C) AI-generated — use an LLM to generate questions on-the-fly or in bulk, with human review
- D) A mix — start with a curated core set, allow community contributions later
- E) Something else?

> The question content should be AI generated but they will be pre-generated. So there should be a large corpus of questions embedded in the game from which the questions are drawn from at game time. In the backend on the game creation / management side there should later be a pipeline of creating the questions with the help of an LLM

---

### 14. Should wrong answers have any penalty beyond not getting a peg?

Currently a wrong answer just means you don't gain anything. Should there be a sting?

- A) No penalty — missing out on a peg is punishment enough
- B) Mild penalty — e.g. lose a random joker, or skip a turn
- C) Only for certain slots — e.g. wrong answer on Slot 4 (high risk) costs you a peg
- D) Configurable in game setup (casual vs. competitive mode)

> No penalty
> However, if someone answers a question wrong, the question should then go to the player with the least amount of points and they have the opportunity to answer it then (So in this case it is important that the answer is not revealed immediately but only after the second player answered.)

---

## Technical & Platform

### 15. What tech stack do you have in mind?

This informs the entire project structure. Any preferences or constraints?

- A) Web-first (e.g. React/Vue/Svelte + backend) — playable in any browser
- B) Native mobile (e.g. React Native, Flutter) — iOS/Android app
- C) Web app with PWA support — works in browser but installable on mobile
- D) No preference — you tell me what makes sense

> The tech stack is not part of the idea I will define this separately later on.

---
