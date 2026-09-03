/**
 * Tests for the game store — the orchestration layer.
 *
 * The engine tests cover the pure algorithms; these cover the state machine
 * driving them. They began as characterization tests written against the old
 * loose-refs store so the GameSession refactor could be shown to preserve
 * behaviour, which is why they lean on observable outcomes rather than
 * internals — keep them that way.
 *
 * The corpus is stubbed at the `fetch` boundary rather than by mocking the
 * corpus store, so the store's real fetch-and-await paths are exercised.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore, createSession } from '../game'
import { serializeSession, deserializeSession, snapshotSession } from '../persistence'
import { useCorpusStore } from '../corpus'
import type { QuestionMeta, Expertise, AnswerResponse, GameState } from '../../types/session'

// ─── Synthetic corpus ────────────────────────────────────────────

const MAJORS = ['History', 'Science', 'Geography']
const SUBS: Record<string, string> = {
  History: 'Ancients',
  Science: 'Physics',
  Geography: 'Capitals',
}
const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'] as const

/** Four questions per major/difficulty pair, so no draw can exhaust a bucket. */
function buildCorpus(): QuestionMeta[] {
  const out: QuestionMeta[] = []
  for (const major of MAJORS) {
    for (const difficulty of DIFFICULTIES) {
      for (let n = 0; n < 4; n++) {
        out.push({
          id: `${major.toLowerCase()}-${difficulty}-${n}`,
          languages: ['de', 'en'],
          major_category: major,
          subcategory: SUBS[major]!,
          difficulty,
          question_type: 'multiple_choice',
          time_limit_seconds: null,
          version: 1,
          created_at: '',
          generation_batch: null,
        })
      }
    }
  }
  for (let n = 0; n < 6; n++) {
    out.push({
      id: `battle-${n}`,
      languages: ['de', 'en'],
      major_category: 'Geography',
      subcategory: 'Capitals',
      difficulty: 'medium',
      question_type: 'estimation',
      time_limit_seconds: null,
      version: 1,
      created_at: '',
      generation_batch: null,
    })
  }
  return out
}

const CORPUS = buildCorpus()

/** Answer payloads keyed by question id, served by the fetch stub. */
function payloadFor(id: string) {
  if (id.startsWith('battle-')) {
    return {
      teaser_title: `Teaser ${id}`,
      question_text: `Question ${id}`,
      hint: null,
      answer_data: { correct_value: 100, unit: 'm' },
    }
  }
  return {
    teaser_title: `Teaser ${id}`,
    question_text: `Question ${id}`,
    hint: `Hint ${id}`,
    answer_data: { options: ['A', 'B', 'C', 'D'], correct_index: 0 },
  }
}

function installFetchStub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const match = /\/corpus\/([^/]+)\/question\./.exec(String(url))
      if (!match) return { ok: false, status: 404 }
      return { ok: true, status: 200, json: async () => payloadFor(match[1]!) }
    }),
  )
}

/** Lets the store's un-awaited internal fetch chains settle. */
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

const EXPERTISE: Expertise = { major_categories: ['History'], subcategories: ['Ancients'] }

/**
 * Every stubbed multiple-choice question has correct_index 0, so these are a
 * right and a wrong answer respectively. Tests send responses, not verdicts —
 * the store grades them, which is the point of gradeAnswer.
 */
const RIGHT: AnswerResponse = { type: 'multiple_choice', index: 0 }
const WRONG: AnswerResponse = { type: 'multiple_choice', index: 1 }

/** Two players, corpus loaded, game started and sitting on the turn gate. */
function startedGame() {
  const game = useGameStore()
  const corpus = useCorpusStore()
  corpus.questions = CORPUS
  corpus.loaded = true
  game.addPlayer('Alice', 'red', EXPERTISE)
  game.addPlayer('Bob', 'blue', EXPERTISE)
  game.startGame()
  return game
}

/** Drive from the turn gate to a displayed question, returning the store. */
async function toQuestion(game: ReturnType<typeof useGameStore>) {
  game.proceedFromTurnGate()
  await flush()
  await game.selectSlot(0)
  if (game.state === 'joker_award') game.proceedFromJokerAward()
  return game
}

/** Take one peg with a correct answer and end the turn. */
async function playTurn(game: ReturnType<typeof useGameStore>) {
  await toQuestion(game)
  game.submitAnswer(RIGHT)
  game.proceedToPlacement()
  const [row, col] = game.turn!.candidate_fields[0]!
  game.placePeg(row, col)
  if (game.state === 'victory') return
  game.confirmEndTurn()
}

/** Answer any battle that opened, so play returns to an ordinary turn. */
async function clearBattle(game: ReturnType<typeof useGameStore>) {
  if (game.state !== 'battle_intro') return
  await game.proceedFromBattleIntro()
  // Cast because TypeScript narrows game.state at the guard above and cannot
  // see that the store has moved it on since.
  while ((game.state as GameState) === 'battle_gate') {
    game.proceedFromBattleGate()
    game.submitBattleAnswer(90 + game.battle!.answers.length * 40)
  }
  game.proceedFromBattleReveal()
}

/**
 * Both players through round one, past the closing battle. Round two is where
 * the pass mechanic first has a previous-round player to hand a question to.
 */
async function intoRoundTwo() {
  const game = startedGame()
  await playTurn(game)
  await playTurn(game)
  await clearBattle(game)
  return game
}

// ─── Tests ───────────────────────────────────────────────────────

describe('game store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFetchStub()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('setup', () => {
    it('starts on the title screen with no players', () => {
      const game = useGameStore()
      expect(game.state).toBe('setup')
      expect(game.setupPhase).toBe('start')
      expect(game.players).toHaveLength(0)
      expect(game.status).toBe('setup')
    })

    it('assigns sequential indices and defaults a blank name to the colour', () => {
      const game = useGameStore()
      game.addPlayer('Alice', 'red', EXPERTISE)
      game.addPlayer('', 'blue', EXPERTISE)
      expect(game.players.map((p) => p.index)).toEqual([0, 1])
      expect(game.players[1]!.name).toBe('Blue')
    })

    it('reindexes players after a removal', () => {
      const game = useGameStore()
      game.addPlayer('Alice', 'red', EXPERTISE)
      game.addPlayer('Bob', 'blue', EXPERTISE)
      game.addPlayer('Cara', 'green', EXPERTISE)
      game.removePlayer(1)
      expect(game.players.map((p) => p.name)).toEqual(['Alice', 'Cara'])
      expect(game.players.map((p) => p.index)).toEqual([0, 1])
    })

    it('excludes taken colours from the available list', () => {
      const game = useGameStore()
      game.addPlayer('Alice', 'red', EXPERTISE)
      expect(game.getAvailableColors()).not.toContain('red')
      expect(game.getAvailableColors()).toContain('blue')
    })

    it('refuses to start with fewer than two players', () => {
      const game = useGameStore()
      game.addPlayer('Alice', 'red', EXPERTISE)
      game.startGame()
      expect(game.state).toBe('setup')
    })

    it('starts a game with an id, a turn and every player on an empty board', () => {
      const game = startedGame()
      expect(game.state).toBe('turn_start')
      expect(game.status).toBe('in_progress')
      expect(game.sessionId).not.toBe('')
      expect(game.round).toBe(1)
      expect(game.currentPlayerIndex).toBe(0)
      expect(game.turn).not.toBeNull()
      expect(game.turn!.active_player_index).toBe(0)
      expect(game.players.every((p) => p.board.peg_count === 0)).toBe(true)
    })

    it('gives the first player of the first round nobody to pass to', () => {
      const game = startedGame()
      expect(game.turn!.previous_round_player_index).toBeNull()
    })
  })

  describe('selection', () => {
    it('offers four slots with teaser titles after the turn gate', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      expect(game.state).toBe('selection')
      expect(game.turn!.offered_slots).toHaveLength(4)
      expect(game.turn!.offered_slots.every((s) => s.teaser_title !== '')).toBe(true)
    })

    it('always makes the fourth slot hard or very hard and joker-bearing', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      const last = game.turn!.offered_slots[3]!
      expect(['hard', 'very_hard']).toContain(last.difficulty)
      expect(last.awards_joker).toBe(true)
    })

    it('never puts a joker chip on the expertise slot', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      expect(game.turn!.offered_slots[0]!.awards_joker).toBe(false)
    })

    it('loads the question and scrambles its options on selection', async () => {
      const game = startedGame()
      await toQuestion(game)
      expect(game.state).toBe('question_display')
      expect(game.currentQuestion).not.toBeNull()
      expect(game.turn!.answer_order).toHaveLength(4)
      expect([...game.turn!.answer_order].sort()).toEqual([0, 1, 2, 3])
    })

    it('awards the joker before the question, on selecting a chipped slot', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      const before = { ...game.players[0]!.jokers }
      await game.selectSlot(3)
      expect(game.state).toBe('joker_award')
      expect(game.jokerAwarded).not.toBeNull()
      const after = game.players[0]!.jokers
      const total = (j: Record<string, number>) => Object.values(j).reduce((a, b) => a + b, 0)
      expect(total(after)).toBe(total(before) + 1)
    })
  })

  describe('answering', () => {
    it('records a correct answer and moves to placement with candidates', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      expect(game.state).toBe('answer_correct')
      expect(game.isCorrect).toBe(true)
      expect(game.players[0]!.stats.questions_correct).toBe(1)
      expect(game.players[0]!.stats.questions_attempted).toBe(1)
      game.proceedToPlacement()
      expect(game.state).toBe('peg_placement')
      expect(game.turn!.pegs_remaining).toBeGreaterThanOrEqual(1)
      expect(game.turn!.candidate_fields.length).toBeGreaterThan(0)
    })

    it('counts a wrong answer as attempted but not correct', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(WRONG)
      expect(game.state).toBe('answer_wrong')
      expect(game.players[0]!.stats.questions_attempted).toBe(1)
      expect(game.players[0]!.stats.questions_correct).toBe(0)
    })

    it('ends the turn instead of passing when there is no previous-round player', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(WRONG)
      game.proceedFromWrongAnswer()
      // Round 1 player 0 has nobody behind them, so the turn simply ends.
      expect(game.currentPlayerIndex).toBe(1)
    })

    it('places a peg on the board and decrements the remaining count', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      const pegs = game.turn!.pegs_remaining
      const [row, col] = game.turn!.candidate_fields[0]!
      game.placePeg(row, col)
      expect(game.players[0]!.board.fields[row]![col]).toBe(true)
      expect(game.players[0]!.board.peg_count).toBe(1)
      expect(game.turn!.pegs_remaining).toBe(pegs - 1)
    })

    it('takes every field at once in auto mode', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      // The Gambler's shape: three fields that all land together.
      game.turn!.pegs_remaining = 3
      game.placePegs([
        [0, 0],
        [1, 1],
        [2, 2],
      ])
      expect(game.players[0]!.board.peg_count).toBe(3)
      expect(game.players[0]!.board.fields[0]![0]).toBe(true)
      expect(game.players[0]!.board.fields[1]![1]).toBe(true)
      expect(game.players[0]!.board.fields[2]![2]).toBe(true)
      expect(game.turn!.pegs_remaining).toBe(0)
    })

    it('checks the win once at the end of a multi-peg placement, not per peg', async () => {
      const game = startedGame()
      const board = game.players[0]!.board
      board.fields[0]![0] = true
      board.fields[1]![1] = true
      board.peg_count = 2
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      game.turn!.pegs_remaining = 2
      // Completes the diagonal on the second field; both still land.
      game.placePegs([
        [2, 2],
        [3, 3],
      ])
      expect(board.peg_count).toBe(4)
      expect(game.state).toBe('victory')
    })

    it('never places two pegs on the same field', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      const [row, col] = game.turn!.candidate_fields[0]!
      game.placePegs([[row, col], [row, col]])
      expect(game.players[0]!.board.peg_count).toBe(1)
    })

    it('advances to the next player on ending a turn', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      const [row, col] = game.turn!.candidate_fields[0]!
      game.placePeg(row, col)
      game.confirmEndTurn()
      expect(game.currentPlayerIndex).toBe(1)
      expect(game.round).toBe(1)
      expect(game.state).toBe('turn_start')
    })
  })

  describe('jokers', () => {
    it('spends a joker and refuses the same type twice in one turn', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.revealHint()
      expect(game.turn!.hint_revealed).toBe(true)
      expect(game.players[0]!.jokers.reveal_hint).toBe(0)
      expect(game.players[0]!.stats.jokers_used).toBe(1)
      // A second use is refused: the inventory is empty and the type is spent.
      game.revealHint()
      expect(game.players[0]!.stats.jokers_used).toBe(1)
    })

    it('does not apply a joker the player cannot pay for', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.revealHint()
      // The hint is spent. A second attempt must not reveal it again for free —
      // the inventory check used to guard the count but not the effect.
      game.turn!.hint_revealed = false
      game.revealHint()
      expect(game.turn!.hint_revealed).toBe(false)
    })

    it('does not curse for free once the curse is spent', async () => {
      const game = startedGame()
      game.players[0]!.jokers.curse = 1
      await toQuestion(game)
      game.applyCurse(1)
      game.players[1]!.is_cursed = false
      game.applyCurse(1)
      expect(game.players[1]!.is_cursed).toBe(false)
    })

    it('does not double down twice on one turn', async () => {
      const game = startedGame()
      game.players[0]!.jokers.double_down = 1
      await toQuestion(game)
      game.activateDoubleDown()
      game.turn!.double_down_active = false
      game.activateDoubleDown()
      expect(game.turn!.double_down_active).toBe(false)
    })

    it('curses an opponent, and the curse is consumed at the start of their turn', async () => {
      const game = startedGame()
      game.players[0]!.jokers.curse = 1
      await toQuestion(game)
      game.applyCurse(1)
      expect(game.players[1]!.is_cursed).toBe(true)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      const [row, col] = game.turn!.candidate_fields[0]!
      game.placePeg(row, col)
      game.confirmEndTurn()
      expect(game.players[1]!.is_cursed).toBe(false)
      expect(game.turn!.curse_active).toBe(true)
    })

    it('refuses to curse yourself', async () => {
      const game = startedGame()
      game.players[0]!.jokers.curse = 1
      await toQuestion(game)
      game.applyCurse(0)
      expect(game.players[0]!.is_cursed).toBe(false)
      expect(game.players[0]!.jokers.curse).toBe(1)
    })

    it('snipes a peg off an opponent board', async () => {
      const game = startedGame()
      game.players[0]!.jokers.snipe = 1
      game.players[1]!.board.fields[2]![2] = true
      game.players[1]!.board.peg_count = 1
      await toQuestion(game)
      game.snipePeg(1, 2, 2)
      expect(game.players[1]!.board.fields[2]![2]).toBe(false)
      expect(game.players[1]!.board.peg_count).toBe(0)
    })

    it('does not snipe an empty field', async () => {
      const game = startedGame()
      game.players[0]!.jokers.snipe = 1
      await toQuestion(game)
      game.snipePeg(1, 0, 0)
      expect(game.players[0]!.jokers.snipe).toBe(1)
    })

    it('adds a peg to the placement when double down is active', async () => {
      const game = startedGame()
      game.players[0]!.jokers.double_down = 1
      await toQuestion(game)
      game.activateDoubleDown()
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      expect(game.turn!.pegs_remaining).toBeGreaterThanOrEqual(2)
    })

    it('replaces all four cards on a selection reshuffle, keeping the chips', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      const before = game.turn!.offered_slots.map((s) => s.question_id)
      const chips = game.turn!.offered_slots.map((s) => s.awards_joker)
      const boosts = game.turn!.offered_slots.map((s) => s.has_2x_boost)
      await game.reshuffleSelection()
      const after = game.turn!.offered_slots.map((s) => s.question_id)
      expect(after).toHaveLength(4)
      expect(after.some((id, i) => id !== before[i])).toBe(true)
      expect(game.turn!.offered_slots.map((s) => s.awards_joker)).toEqual(chips)
      expect(game.turn!.offered_slots.map((s) => s.has_2x_boost)).toEqual(boosts)
    })
  })

  describe('the gambler', () => {
    it('needs a peg to stake', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.startGambler()
      expect(game.state).toBe('question_display')
    })

    it('stakes an owned peg and takes it on a wrong answer', async () => {
      const game = startedGame()
      game.players[0]!.board.fields[1]![1] = true
      game.players[0]!.board.peg_count = 1
      game.proceedFromTurnGate()
      await flush()
      game.startGambler()
      expect(game.state).toBe('gambler_confirm')
      expect(game.turn!.gambler_staked_field).toEqual([1, 1])
      await game.confirmGambler()
      expect(game.state).toBe('gambler_question')
      game.resolveGambler(WRONG)
      expect(game.gamblerWon).toBe(false)
      expect(game.players[0]!.board.fields[1]![1]).toBe(false)
      expect(game.players[0]!.board.peg_count).toBe(0)
    })

    it('keeps the staked peg and awards three on a correct answer', async () => {
      const game = startedGame()
      game.players[0]!.board.fields[1]![1] = true
      game.players[0]!.board.peg_count = 1
      game.proceedFromTurnGate()
      await flush()
      game.startGambler()
      await game.confirmGambler()
      game.resolveGambler(RIGHT)
      expect(game.gamblerWon).toBe(true)
      expect(game.players[0]!.board.fields[1]![1]).toBe(true)
      game.proceedFromGamblerResolve()
      expect(game.state).toBe('peg_placement')
      expect(game.turn!.pegs_remaining).toBe(3)
    })

    it('returns to selection when cancelled', async () => {
      const game = startedGame()
      game.players[0]!.board.fields[1]![1] = true
      game.players[0]!.board.peg_count = 1
      game.proceedFromTurnGate()
      await flush()
      game.startGambler()
      game.cancelGambler()
      expect(game.state).toBe('selection')
      expect(game.turn!.gambler_staked_field).toBeNull()
    })
  })

  describe('victory', () => {
    it('declares a win when a placement completes a line', async () => {
      const game = startedGame()
      const board = game.players[0]!.board
      board.fields[0]![0] = true
      board.fields[0]![1] = true
      board.fields[0]![2] = true
      board.peg_count = 3
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      game.placePeg(0, 3)
      expect(game.state).toBe('victory')
      expect(game.status).toBe('finished')
      expect(game.winnerPlayerIndex).toBe(0)
      expect(game.winningLines).not.toBeNull()
    })

    it('clears the board and players on reset', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.resetGame()
      expect(game.state).toBe('setup')
      expect(game.players).toHaveLength(0)
      expect(game.turn).toBeNull()
      expect(game.status).toBe('setup')
    })
  })

  describe('battles', () => {
    /** Play both players through a turn so the round closes into a battle. */
    async function playRoundIntoBattle() {
      const game = startedGame()
      for (let i = 0; i < 2; i++) {
        await toQuestion(game)
        game.submitAnswer(RIGHT)
        game.proceedToPlacement()
        const [row, col] = game.turn!.candidate_fields[0]!
        game.placePeg(row, col)
        if (game.state === 'victory') break
        game.confirmEndTurn()
      }
      return game
    }

    it('opens a battle once everybody has played the round', async () => {
      const game = await playRoundIntoBattle()
      expect(game.state).toBe('battle_intro')
      expect(game.battle).not.toBeNull()
      expect(game.battle!.order).toEqual([0, 1])
      expect(game.battle!.challenger_index).toBeNull()
    })

    it('collects one answer per player, then reveals', async () => {
      const game = await playRoundIntoBattle()
      await game.proceedFromBattleIntro()
      expect(game.state).toBe('battle_gate')
      game.proceedFromBattleGate()
      expect(game.battlePlayerIndex).toBe(0)
      game.submitBattleAnswer(90)
      expect(game.state).toBe('battle_gate')
      game.proceedFromBattleGate()
      expect(game.battlePlayerIndex).toBe(1)
      game.submitBattleAnswer(50)
      expect(game.state).toBe('battle_reveal')
      expect(game.battle!.answers).toHaveLength(2)
    })

    it('ranks by absolute distance, nearest first', async () => {
      const game = await playRoundIntoBattle()
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(90) // 10 off
      game.proceedFromBattleGate()
      game.submitBattleAnswer(130) // 30 off
      expect(game.battle!.winner_index).toBe(0)
      expect(game.battle!.loser_index).toBe(1)
      expect(game.battle!.answers[0]!.distance).toBe(10)
      expect(game.battle!.answers[1]!.distance).toBe(30)
    })

    it('overshooting is not punished more than undershooting', async () => {
      const game = await playRoundIntoBattle()
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(110) // 10 over
      game.proceedFromBattleGate()
      game.submitBattleAnswer(80) // 20 under
      expect(game.battle!.winner_index).toBe(0)
    })

    it('makes no transfer when the battle is a tie', async () => {
      const game = await playRoundIntoBattle()
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(90)
      game.proceedFromBattleGate()
      game.submitBattleAnswer(110)
      expect(game.battle!.transfer).toBeNull()
    })

    it('returns to the next turn after a round battle', async () => {
      const game = await playRoundIntoBattle()
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(90)
      game.proceedFromBattleGate()
      game.submitBattleAnswer(130)
      game.proceedFromBattleReveal()
      expect(game.state).toBe('turn_start')
      expect(game.battle).toBeNull()
      expect(game.round).toBe(2)
    })

    it('a duel runs between two players and returns to selection', async () => {
      const game = startedGame()
      game.players[0]!.jokers.duel = 1
      game.proceedFromTurnGate()
      await flush()
      game.startDuel(1)
      expect(game.state).toBe('battle_intro')
      expect(game.battle!.challenger_index).toBe(0)
      expect(game.battle!.order).toEqual([0, 1])
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(100)
      game.proceedFromBattleGate()
      game.submitBattleAnswer(500)
      game.proceedFromBattleReveal()
      expect(game.state).toBe('selection')
    })

    it('a lost duel costs the challenger nothing', async () => {
      const game = startedGame()
      game.players[0]!.jokers.duel = 1
      game.players[0]!.board.fields[0]![0] = true
      game.players[0]!.board.peg_count = 1
      game.proceedFromTurnGate()
      await flush()
      game.startDuel(1)
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(500) // challenger far off
      game.proceedFromBattleGate()
      game.submitBattleAnswer(100) // target nails it
      expect(game.battle!.winner_index).toBe(1)
      expect(game.battle!.transfer).toBeNull()
      expect(game.players[0]!.board.peg_count).toBe(1)
    })
  })

  describe('the pass', () => {
    it('hands a wrong answer to the previous-round player from round two', async () => {
      const game = startedGame()
      // Play player 0 and 1 through round 1 without triggering the battle path
      // mattering, then reach player 0 again in round 2.
      for (let i = 0; i < 2; i++) {
        await toQuestion(game)
        game.submitAnswer(RIGHT)
        game.proceedToPlacement()
        const [row, col] = game.turn!.candidate_fields[0]!
        game.placePeg(row, col)
        game.confirmEndTurn()
      }
      // Clear the round battle if one opened.
      if (game.state === 'battle_intro') {
        await game.proceedFromBattleIntro()
        game.proceedFromBattleGate()
        game.submitBattleAnswer(90)
        game.proceedFromBattleGate()
        game.submitBattleAnswer(130)
        game.proceedFromBattleReveal()
      }
      expect(game.round).toBe(2)
      await toQuestion(game)
      game.submitAnswer(WRONG)
      game.proceedFromWrongAnswer()
      expect(game.state).toBe('pass_gate')
      expect(game.turn!.pass).not.toBeNull()
      expect(game.turn!.pass!.pass_player_index).toBe(1)
    })
  })

  describe('the session as a save format', () => {
    it('survives a JSON round-trip with its Sets intact', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.revealHint() // puts an entry in turn.jokers_used_this_turn
      game.submitAnswer(RIGHT)

      const wire = JSON.parse(JSON.stringify(serializeSession(game.session)))
      const restored = deserializeSession(wire)

      expect(restored.used_question_ids).toBeInstanceOf(Set)
      expect(restored.turn!.jokers_used_this_turn).toBeInstanceOf(Set)
      expect(restored.turn!.jokers_used_this_turn.has('reveal_hint')).toBe(true)
      expect([...restored.used_question_ids]).toEqual([...game.session.used_question_ids])
      expect(restored.state).toBe(game.state)
      expect(restored.players).toEqual(game.players)
      expect(restored.narration).toEqual(game.session.narration)
    })

    it('carries the battle, so one in flight is not lost on a reload', async () => {
      const game = startedGame()
      game.players[0]!.jokers.duel = 1
      game.proceedFromTurnGate()
      await flush()
      game.startDuel(1)
      await game.proceedFromBattleIntro()
      game.proceedFromBattleGate()
      game.submitBattleAnswer(90)

      const restored = deserializeSession(
        JSON.parse(JSON.stringify(serializeSession(game.session))),
      )
      expect(restored.battle).not.toBeNull()
      expect(restored.battle!.answers).toHaveLength(1)
      expect(restored.battle!.challenger_index).toBe(0)
    })

    it('snapshots the live reactive session without choking on the proxy', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.revealHint()

      // `game.session` is a Vue reactive Proxy. structuredClone throws
      // DataCloneError on those, which is why snapshotSession round-trips
      // through JSON instead — this is the regression guard for that.
      const snapshot = snapshotSession(game.session)

      expect(() => JSON.stringify(snapshot)).not.toThrow()
      expect(Array.isArray(snapshot.data.used_question_ids)).toBe(true)
      expect(Array.isArray(snapshot.data.turn!.jokers_used_this_turn)).toBe(true)
      expect(snapshot.data.turn!.jokers_used_this_turn).toContain('reveal_hint')
      // And it round-trips back into a usable session.
      expect(deserializeSession(snapshot).state).toBe(game.state)
    })

    it('records the seed and the generator position once a game starts', () => {
      const game = startedGame()
      expect(game.session.rng_seed).toBeGreaterThan(0)
      expect(game.session.rng_state).not.toBeNull()
      expect(game.session.created_at).not.toBe('')
    })

    it('resumes mid-sequence rather than re-drawing what was already spent', async () => {
      const game = startedGame()
      await toQuestion(game)
      game.submitAnswer(RIGHT)
      game.proceedToPlacement()
      const expected = [...game.turn!.candidate_fields]

      // Reload: a fresh store adopts the serialized session.
      const wire = JSON.parse(JSON.stringify(serializeSession(game.session)))
      setActivePinia(createPinia())
      const reloaded = useGameStore()
      const corpus = useCorpusStore()
      corpus.questions = CORPUS
      corpus.loaded = true
      reloaded.loadSessionState(deserializeSession(wire))

      expect(reloaded.state).toBe('peg_placement')
      expect(reloaded.turn!.candidate_fields).toEqual(expected)
      // Placing from the restored session continues the same board.
      const [row, col] = reloaded.turn!.candidate_fields[0]!
      reloaded.placePeg(row, col)
      expect(reloaded.players[0]!.board.peg_count).toBe(1)
    })

    it('offers a resumable game and drops it when declined', () => {
      const game = useGameStore()
      const saved = { ...createSession(), status: 'in_progress' as const, round: 4 }
      game.resumableSession = saved
      expect(game.resumableSession!.round).toBe(4)
      game.discardResumableGame()
      expect(game.resumableSession).toBeNull()
    })
  })

  describe('determinism', () => {
    it('replays identically from the same seed', async () => {
      const play = async () => {
        setActivePinia(createPinia())
        const game = useGameStore()
        const corpus = useCorpusStore()
        corpus.questions = CORPUS
        corpus.loaded = true
        game.addPlayer('Alice', 'red', EXPERTISE)
        game.addPlayer('Bob', 'blue', EXPERTISE)
        game.startGame(20260903)
        game.proceedFromTurnGate()
        await flush()
        return {
          slots: game.turn!.offered_slots.map((s) => s.question_id),
          boosts: [...game.turn!.boosted_slot_indices],
          turnLine: game.turnLine,
        }
      }
      expect(await play()).toEqual(await play())
    })

    it('gives different games for different seeds', async () => {
      const play = async (seed: number) => {
        setActivePinia(createPinia())
        const game = useGameStore()
        const corpus = useCorpusStore()
        corpus.questions = CORPUS
        corpus.loaded = true
        game.addPlayer('Alice', 'red', EXPERTISE)
        game.addPlayer('Bob', 'blue', EXPERTISE)
        game.startGame(seed)
        game.proceedFromTurnGate()
        await flush()
        return game.turn!.offered_slots.map((s) => s.question_id).join()
      }
      expect(await play(1)).not.toBe(await play(999))
    })

    it('re-scrambles the options when a question is passed on', async () => {
      const game = await intoRoundTwo()
      await toQuestion(game)
      const first = [...game.turn!.answer_order]
      game.submitAnswer(WRONG)
      game.proceedFromWrongAnswer()
      expect(game.state).toBe('pass_gate')
      game.proceedFromPassGate()
      // A fresh scramble is drawn; it is a permutation of the same indices.
      expect([...game.turn!.answer_order].sort()).toEqual([...first].sort())
      expect(game.state).toBe('pass_answering')
    })
  })

  describe('the state machine', () => {
    it('refuses a transition the table does not allow', () => {
      const game = startedGame()
      // turn_start goes only to selection. Nothing else guards this call, so
      // the transition table is what stops the game entering pass_answering
      // with no pass in progress.
      expect(() => game.proceedFromPassGate()).toThrow(/turn_start -> pass_answering/)
      expect(game.state).toBe('turn_start')
    })

    it('rejects an answer submitted before a question is on screen', async () => {
      const game = startedGame()
      game.proceedFromTurnGate()
      await flush()
      // selection cannot go straight to a verdict.
      expect(() => game.submitAnswer(RIGHT)).toThrow(/Illegal state transition/)
    })
  })
})
