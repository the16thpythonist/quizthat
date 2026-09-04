# QuizThat!

Local-multiplayer quiz/bingo game (2–6 players sharing one tablet) plus an offline
pipeline that generates its question corpus with LLMs and TTS.

Design docs: [IDEA.md](./IDEA.md) game design · [SPEC.md](./SPEC.md) full spec ·
[TECH.md](./TECH.md) tech choices · [IMPL.md](./IMPL.md) current code walkthrough ·
[CLI.md](./CLI.md) the pipeline's mixin CLI pattern.

**Keep IMPL.md current.** It is the written description of the codebase; if you change
architecture, screens, or the corpus format, update it in the same change.

---

## Commands

### Frontend (`frontend/`)

```bash
npm run dev          # Vite dev server on :5173
npm test             # vitest run  (engine, rng, and game store)
npm run test:watch
npm run build        # vue-tsc -b && vite build
```

### Pipeline (`pipeline/`)

```bash
uv sync                              # required before anything else
uv run quizthat --help               # command groups: generate, batch, corpus, audio, categories
uv run quizthat corpus stats
uv run quizthat corpus validate
uv run quizthat audio check-api      # verifies ELEVENLABS_API_KEY + shows tier/quota
```

Always `uv run` — the venv is at `pipeline/.venv` and there is no activate step in
documented workflows. Check `--help` for flags rather than assuming them.

### Corpus index

```bash
scripts/build-corpus-index           # writes questions/corpus-index.json (gitignored)
```

The frontend fetches this at startup, so regenerate it after adding questions.

### Docker

```bash
docker compose up    # frontend :5173 + nginx serving questions/ on :8080
```

Vite proxies `/corpus/*` to `CORPUS_PROXY_TARGET` (default `http://localhost:8080`).

---

## Architecture

Two independent systems sharing one data format (the `questions/` corpus).

**Shared-tablet play needs no server.** The game is a client-side SPA and the corpus
is static files; offline is the default and still works with the backend switched off.

A Django + DRF backend in `backend/` adds **multi-device lobbies** — everyone on their
own phone, plus an optional TV joined as a read-only spectator. The shape:

- **Thin relay.** The server stores an opaque session blob and fans it out. It never
  parses the game state and never knows the rules. One client is authoritative and
  runs the TypeScript engine; the server is lobby + intent inbox + SSE fan-out.
- **`GameSession` is the unit.** It is already the save format (SPEC §9); it becomes
  the sync unit unchanged. `serializeSession` is therefore the wire format, not just
  the disk format.
- **Intents, not verdicts.** Screens send an `AnswerResponse` — what the player did
  — and `gradeAnswer()` in the engine decides. A client must never assert its own
  correctness. `GameIntentMap` in `stores/game.ts` is the compiler-enforced
  vocabulary; `dispatch()` applies one, locally or relayed.
- **`VALID_TRANSITIONS` is enforced**, via `_setState`. That is what refuses a
  malformed or out-of-turn intent.

- **`net.canActNow` is the single gate.** A device the game is not waiting on
  renders `MirrorScreen`: the *real* screens, read-only. Mirroring is not passive —
  PegPlacementScreen places pegs from a watcher, JokerTargetSheet curses on mount —
  so the check lives in `net.act()`, where every action already passes, not on taps.
  `redactSessionFor()` is the other half: a guest cannot be shown a secret and asked
  not to look. What a player is part-way through typing never leaves their device,
  which is why the TV can show the question and options but not the answer.
- **A local game broadcasts itself.** Starting a shared-tablet game opens a lobby
  marked `local`, so a television can watch it. Best-effort: playing round a tablet
  must keep working with no server at all, so a failure there is swallowed.
- **Screens call `useActions()`**, not the store directly: `act.selectSlot(2)` routes
  through the transport so no screen knows which mode it is in.

Don't undo that as "unused indirection", and don't move the rules back into components.

### Backend (`backend/`)

```bash
uv sync --extra dev                  # venv at backend/.venv, like pipeline/
uv run python manage.py migrate
uv run pytest                        # relay routing + stats
uv run uvicorn quizthat_server.asgi:application --reload --port 8000
```

**Use `--reload`.** Without it uvicorn serves the code it started with, and an hour
disappears debugging a fix that is already on disk.

Three apps, none of which knows the game: `lobbies` (the relay), `corpus` (reads
`questions/` off disk — **no Question model**, the folder is the source of truth), and
`stats` (nickname is the whole identity; two people called "Jonas" share a profile).

Vite proxies `/api` to it, so a phone on the LAN reaches both at the same host.

### Frontend conventions

- **No Vue Router.** The Pinia store holds a `GameState` enum; `App.vue` renders
  `screenForState(state)`. Navigation means changing state — no URLs, no back button.
- **Never use `Math.random()`.** Every random decision goes through the seeded PRNG in
  `engine/rng.ts`. `GameSession` stores both `rng_seed` and `rng_state` — reseeding
  alone rewinds the generator, so a resumed or relayed game would re-draw what it had
  already spent. Confetti and the dev animation harness are the only exemptions.
- **`engine/` is pure logic** — no Vue imports, no DOM. Keep new game logic there
  rather than in components. In particular **components never decide an outcome**:
  `gradeAnswer()` is the only authority on whether an answer is right, and
  `calculatePegCount()` on what it is worth.
- State transitions go through `_setState`, which throws on anything
  `VALID_TRANSITIONS` in `engine/stateMachine.ts` does not allow.
- The store holds one `session: Ref<GameSession>`; `players`, `turn`, `round` … are
  read-only computed views onto it. Persistence is debounced 500 ms into IndexedDB,
  with an immediate flush on `visibilitychange`/`pagehide`. Note `structuredClone`
  throws on Vue's reactive proxies — snapshot through `snapshotSession()`.

### Corpus format

One directory per question under `questions/<id>/`:

```
meta.json            language-neutral: id, languages, category, difficulty, type
question.en.json     per-language: teaser_title, question_text, hint, answer_data
question.de.json
audio/               teaser.<lang>.mp3, question.<lang>.mp3, answer_<n>.<lang>.mp3
```

Only languages listed in `meta.json`'s `languages` array need files.

> **Known inconsistency:** existing `meta.json` files disagree with
> `pipeline/config/categories.yaml` — some use slugs (`physics`), others display names
> (`Physics`, `World Wars`). Normalize to the yaml slugs when touching this.

---

## Audio

Two separate ElevenLabs surfaces: **sound effects** (game SFX) and **text-to-speech**
(narrator voice lines). Both read `ELEVENLABS_API_KEY` from the **repo-root `.env`**
(gitignored; `pipeline/quizthat/cli/__init__.py` loads it via `find_dotenv(usecwd=True)`).

### Rules that apply to both

**One API call per request.** Do not generate variants, candidates, or alternatives to
offer a choice unless explicitly asked. The account is on the **free tier**
(~50 SFX generations/month). If options would genuinely help, ask first.

**Free-tier output is licensed personal-use-only.** Anything generated now is a
placeholder; it must be regenerated on Creator or above before shipping. Say so when
handing over generated audio.

**Everything is normalized to −14 LUFS** (SPEC.md §6). Higher than the −16 broadcast
standard, deliberately — it has to cut through a noisy room on tablet speakers.

Required API key scopes (set per-key in the ElevenLabs dashboard): `sound_generation`,
`text_to_speech`. Optional `user_read` — only powers the quota readout, and
`cli/audio.py` already degrades gracefully without it.

### Sound effects

`frontend/src/audio/sfx.ts` declares nine slots mapping to `frontend/public/sfx/*.mp3`.
Files are served from `public/`, not bundled.

**Generate one clip:**

```bash
uv run --directory pipeline --with python-dotenv \
    python ../scripts/gen-sfx.py OUT.mp3 "PROMPT" 2.0
```

Wraps `client.text_to_sound_effects.convert(text=..., duration_seconds=...,
prompt_influence=0.6)`. Duration is 0.5–30 s; `loop=True` is available for ambient beds.

**Then always post-process:**

```bash
scripts/postprocess-sfx.sh OUT.mp3          # in place; idempotent
SFX_SILENCE_DB=-30 scripts/postprocess-sfx.sh OUT.mp3   # if a tail survives
```

**Raw API output is not usable as-is.** It arrives around **−6 LUFS with true peaks
over 0 dBFS** (clipping), roughly 8 dB hotter than spec, and padded with silence to the
requested `duration_seconds` regardless of actual content. `postprocess-sfx.sh` trims
the tail, normalizes to −14 LUFS / −1 dBTP, adds a 25 ms fade-out and re-encodes to
128 kbps MP3.

Two traps the script exists to avoid:

- It trims a silent region **only when that region reaches the end of the file** —
  otherwise a multi-hit sound (a double buzz) gets cut at its internal gap.
- The threshold is **−40 dB**, not −50 dB: ElevenLabs tails decay above −50 dB and
  slip past a stricter gate.

Before trusting a clip, check the RMS envelope — a clip can be nominally 2.5 s but hold
0.5 s of content:

```bash
ffmpeg -i F.mp3 -af "astats=metadata=1:reset=0.25,ametadata=print:key=lavfi.astats.Overall.RMS_level" -f null -
ffmpeg -i F.mp3 -af ebur128=peak=true -f null -     # integrated loudness + true peak
```

**Prompting.** Name the instrument or mechanism, not the onomatopoeia — "sad trombone
womp womp, plunger mute, descending glissando" works; "dum dum duuum" produced
orchestral timpani. Add `dry studio recording, no reverb, no music` or the tail smears
into whatever plays next. Request a duration close to the natural length of the sound;
over-requesting invites padding. The same prompt returns different audio each call.

**Promoting a pick:** copy into `frontend/public/sfx/` under the exact filename in
`sfx.ts` (e.g. `incorrect.mp3`). Scratch candidates live in `sfx-candidates/`, which is
gitignored — only promoted files are tracked.

**Wiring:** `AnswerResultScreen` plays the verdict sting; `App.vue` drives the music
lifecycle and the title-screen opening sequence. Dropping a file into `public/sfx/`
under the exact name in `sfx.ts` makes it audible at its trigger point — the other
seven slots have no trigger wired yet, and slots with no file are silent no-ops.

**Music must not be MP3.** MP3 pads every file with encoder delay, so it cannot loop
gaplessly (~32 ms hiccup per wrap). Ship Ogg Vorbis, with MP3 only as a Safari
fallback in the source list. See `MUSIC` in `sfx.ts`.

### Narrator voice lines (TTS)

Driven by the pipeline, not by hand:

```bash
uv run quizthat audio test "some text" -l de     # single clip
uv run quizthat audio generate questions/<id>    # one question, all languages
uv run quizthat audio batch [--force]            # every question missing audio
```

Without an API key these run in **stub mode**, writing empty placeholder files —
so a "success" with no key means nothing was generated. `audio batch` treats a
zero-byte `question.<lang>.mp3` as missing.

Voices are configured in `pipeline/config/voices.yaml` (voice_id, model, stability,
similarity_boost, output_format) — swap narrators there, never in code. Output is
`mp3_44100_64` (64 kbps mono), which is right for speech but too low for SFX; use
128 kbps for effects.

Normalization is dual-pass EBU R128 to −14 LUFS, except clips under 3 s which use peak
normalization instead (R128 is unreliable on very short audio).

**Cost accounting differs between the two APIs.** TTS bills per character —
`TIER_PRICING` in `pipeline/quizthat/tts/client.py` is USD per 1000 characters. SFX
bills **per generation** (~200 credits) regardless of length, so `TIER_PRICING` and
`estimate_cost()` do **not** apply to sound effects.

---

## Other free SFX sources

For generic sounds, prefer these over spending generation quota:

- **[Freesound](https://freesound.org)** — REST API, token auth from
  [apiv2/apply](https://freesound.org/apiv2/apply) (instant). Search and `preview-hq-mp3`
  download need only the token; OAuth2 is required *only* for original-format files,
  which short SFX don't need. Filter `license:"Creative Commons 0"` to avoid attribution.
  60 req/min, 2000/day. Reserve `FREESOUND_API_KEY` in `.env` is already stubbed.
- **[Kenney](https://kenney.nl/assets/category:Audio)** — CC0, no API and no key; scrape
  the pack page for the ZIP link. Best for the UI slots.
- **Pixabay has no audio API** (images/video only) despite the good web library.
- **Avoid the BBC Sound Effects archive** — the RemArc licence is non-commercial.
