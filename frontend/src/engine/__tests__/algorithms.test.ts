import { describe, it, expect } from 'vitest'
import {
  checkWin,
  findCompletedLines,
  isBoostEligible,
  assignBoostSlots,
  assignJokerSlots,
  pickSlot1Difficulty,
  generateSlots,
  placementRuleForSlot,
  passPlacementRule,
  gamblerPlacementRule,
  previousRoundPlayer,
  generateStartingPegs,
  calculatePegCount,
  createEmptyBoard,
  getEmptyFields,
  getConstrainedEmptyFields,
  generateCandidates,
  rollBasicJokerReEarn,
  awardSpecialJoker,
  scrambleAnswerOrder,
} from '../algorithms'
import {
  pickPlayerIntroLine,
  GENERIC_PLAYER_INTRO_KEYS,
} from '../algorithms'
import { GameRng } from '../rng'
import type { Board, Player, OfferedSlot } from '../../types/session'

// ─── Helpers ─────────────────────────────────────────────────────

function makeBoard(size: number, fills: [number, number][] = []): Board {
  const board = createEmptyBoard(size)
  for (const [r, c] of fills) {
    const row = board.fields[r]
    if (row) {
      row[c] = true
      board.peg_count++
    }
  }
  return board
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    index: 0,
    name: 'Red',
    color: 'red',
    expertise: { major_categories: [], subcategories: [] },
    board: createEmptyBoard(4),
    jokers: {
      reshuffle_selection: 1,
      reshuffle_question: 1,
      reveal_hint: 1,
      the_gambler: 1,
      steal: 0,
      curse: 0,
      snipe: 0,
      double_down: 0,
    },
    stats: {
      questions_attempted: 0,
      questions_correct: 0,
      passes_received: 0,
      passes_correct: 0,
      jokers_used: 0,
      pegs_stolen_from: 0,
    },
    is_cursed: false,
    ...overrides,
  }
}

// ─── Win Detection ──────────────────────────────────────────────

describe('checkWin', () => {
  it('returns null for empty board', () => {
    expect(checkWin(makeBoard(4))).toBeNull()
  })

  it('detects a complete row', () => {
    const board = makeBoard(4, [[1, 0], [1, 1], [1, 2], [1, 3]])
    expect(checkWin(board)).toEqual([[[1, 0], [1, 1], [1, 2], [1, 3]]])
  })

  it('detects a complete column', () => {
    const board = makeBoard(3, [[0, 2], [1, 2], [2, 2]])
    expect(checkWin(board)).toEqual([[[0, 2], [1, 2], [2, 2]]])
  })

  it('detects main diagonal', () => {
    const board = makeBoard(3, [[0, 0], [1, 1], [2, 2]])
    expect(checkWin(board)).toEqual([[[0, 0], [1, 1], [2, 2]]])
  })

  it('detects anti-diagonal', () => {
    const board = makeBoard(3, [[0, 2], [1, 1], [2, 0]])
    expect(checkWin(board)).toEqual([[[0, 2], [1, 1], [2, 0]]])
  })

  it('returns null for incomplete line', () => {
    const board = makeBoard(4, [[1, 0], [1, 1], [1, 2]])
    expect(checkWin(board)).toBeNull()
  })

  it('works on 5x5 board', () => {
    const board = makeBoard(5, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]])
    expect(checkWin(board)).toEqual([[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]])
  })

  it('does not win on one line when two are required', () => {
    const board = makeBoard(4, [[1, 0], [1, 1], [1, 2], [1, 3]])
    expect(checkWin(board, 2)).toBeNull()
  })

  it('wins on two crossing lines when two are required', () => {
    // row 0 plus column 1, sharing the peg at 0,1 — seven pegs in all
    const board = makeBoard(4, [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 1], [2, 1], [3, 1],
    ])
    const result = checkWin(board, 2)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual([[0, 0], [0, 1], [0, 2], [0, 3]])
    expect(result).toContainEqual([[0, 1], [1, 1], [2, 1], [3, 1]])
  })

  it('wins on two parallel lines when two are required', () => {
    const board = makeBoard(4, [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [2, 0], [2, 1], [2, 2], [2, 3],
    ])
    expect(checkWin(board, 2)).toHaveLength(2)
  })
})

describe('findCompletedLines', () => {
  it('finds nothing on an empty board', () => {
    expect(findCompletedLines(makeBoard(4))).toEqual([])
  })

  it('counts a crossing row and column as two separate lines', () => {
    const board = makeBoard(4, [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 1], [2, 1], [3, 1],
    ])
    expect(findCompletedLines(board)).toHaveLength(2)
  })

  it('finds a filled board\'s rows, columns and both diagonals', () => {
    const all: [number, number][] = []
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) all.push([r, c])
    // 4 rows + 4 columns + 2 diagonals
    expect(findCompletedLines(makeBoard(4, all))).toHaveLength(10)
  })
})

// ─── 2x Boost Eligibility ───────────────────────────────────────

describe('isBoostEligible', () => {
  it('returns false when round < 3', () => {
    const players = [
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 0 } }),
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 2 } }),
    ]
    expect(isBoostEligible(2, players, 0)).toBe(false)
  })

  it('returns true when player has fewest correct and round >= 3', () => {
    const players = [
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 1 } }),
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 3 } }),
    ]
    expect(isBoostEligible(3, players, 0)).toBe(true)
  })

  it('returns false when player does not have fewest correct', () => {
    const players = [
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 3 } }),
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 1 } }),
    ]
    expect(isBoostEligible(3, players, 0)).toBe(false)
  })

  it('returns true for all tied players', () => {
    const players = [
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 2 } }),
      makePlayer({ stats: { ...makePlayer().stats, questions_correct: 2 } }),
    ]
    expect(isBoostEligible(3, players, 0)).toBe(true)
    expect(isBoostEligible(3, players, 1)).toBe(true)
  })
})

// ─── Previous Round Player ──────────────────────────────────────

describe('previousRoundPlayer', () => {
  it('returns null for first turn of game', () => {
    expect(previousRoundPlayer(1, 0, 4)).toBeNull()
  })

  it('returns previous player in turn order', () => {
    expect(previousRoundPlayer(1, 1, 4)).toBe(0)
    expect(previousRoundPlayer(1, 2, 4)).toBe(1)
  })

  it('wraps around to last player', () => {
    expect(previousRoundPlayer(2, 0, 4)).toBe(3)
  })
})

// ─── Peg Count ──────────────────────────────────────────────────

describe('calculatePegCount', () => {
  it('returns 1 for base', () => {
    expect(calculatePegCount(false, false)).toBe(1)
  })

  it('returns 2 with 2x boost', () => {
    expect(calculatePegCount(true, false)).toBe(2)
  })

  it('returns 2 with double down', () => {
    expect(calculatePegCount(false, true)).toBe(2)
  })

  it('returns 3 with both', () => {
    expect(calculatePegCount(true, true)).toBe(3)
  })
})

// ─── Starting Pegs ──────────────────────────────────────────────

describe('generateStartingPegs', () => {
  it('returns empty for count 0', () => {
    const rng = new GameRng(42)
    expect(generateStartingPegs(rng, 4, 0)).toEqual([])
  })

  it('generates correct number of pegs', () => {
    const rng = new GameRng(42)
    const pegs = generateStartingPegs(rng, 4, 3)
    expect(pegs).toHaveLength(3)
  })

  it('respects max per line constraint', () => {
    const rng = new GameRng(42)
    const pegs = generateStartingPegs(rng, 4, 5)
    // Max per line = floor(4/2) = 2
    // Check all rows
    for (let r = 0; r < 4; r++) {
      expect(pegs.filter(([pr]) => pr === r).length).toBeLessThanOrEqual(2)
    }
    // Check all columns
    for (let c = 0; c < 4; c++) {
      expect(pegs.filter(([, pc]) => pc === c).length).toBeLessThanOrEqual(2)
    }
    // Check diagonals
    expect(pegs.filter(([r, c]) => r === c).length).toBeLessThanOrEqual(2)
    expect(pegs.filter(([r, c]) => r + c === 3).length).toBeLessThanOrEqual(2)
  })

  it('generates unique positions', () => {
    const rng = new GameRng(42)
    const pegs = generateStartingPegs(rng, 4, 4)
    const positionStrings = pegs.map(([r, c]) => `${r},${c}`)
    expect(new Set(positionStrings).size).toBe(pegs.length)
  })
})

// ─── Empty Fields ───────────────────────────────────────────────

describe('getEmptyFields', () => {
  it('returns all fields for empty board', () => {
    const board = makeBoard(3)
    expect(getEmptyFields(board)).toHaveLength(9)
  })

  it('excludes filled fields', () => {
    const board = makeBoard(3, [[0, 0], [1, 1]])
    expect(getEmptyFields(board)).toHaveLength(7)
  })
})

describe('getConstrainedEmptyFields', () => {
  it('returns empty fields in a row', () => {
    const board = makeBoard(4, [[1, 0], [1, 2]])
    const fields = getConstrainedEmptyFields(board, { type: 'row', index: 1, display: 'Row 2' })
    expect(fields).toHaveLength(2)
    expect(fields).toContainEqual([1, 1])
    expect(fields).toContainEqual([1, 3])
  })

  it('returns empty fields in a column', () => {
    const board = makeBoard(4, [[0, 2], [3, 2]])
    const fields = getConstrainedEmptyFields(board, { type: 'column', index: 2, display: 'Column C' })
    expect(fields).toHaveLength(2)
    expect(fields).toContainEqual([1, 2])
    expect(fields).toContainEqual([2, 2])
  })
})

// ─── Candidate Generation ───────────────────────────────────────

describe('generateCandidates', () => {
  it('returns N candidates for random_board placement', () => {
    const rng = new GameRng(42)
    const board = makeBoard(4)
    const candidates = generateCandidates(rng, board, {
      type: 'random_board',
      constraint: null,
      candidates_count: 2, mode: 'choose' as const,
    })
    expect(candidates).toHaveLength(2)
  })

  it('returns all empty for free placement', () => {
    const rng = new GameRng(42)
    const board = makeBoard(3, [[0, 0], [1, 1]])
    const candidates = generateCandidates(rng, board, {
      type: 'free',
      constraint: null,
      candidates_count: 0, mode: 'choose' as const,
    })
    expect(candidates).toHaveLength(7)
  })

  it('returns constrained candidates', () => {
    const rng = new GameRng(42)
    const board = makeBoard(4, [[1, 0]])
    const candidates = generateCandidates(rng, board, {
      type: 'constrained',
      constraint: { type: 'row', index: 1, display: 'Row 2' },
      candidates_count: 2, mode: 'choose' as const,
    })
    expect(candidates).toHaveLength(2)
    // All candidates should be in row 1
    for (const [r] of candidates) {
      expect(r).toBe(1)
    }
  })

  it('returns all eligible if fewer than N', () => {
    const rng = new GameRng(42)
    // Row 1 has only 1 empty field
    const board = makeBoard(4, [[1, 0], [1, 1], [1, 3]])
    const candidates = generateCandidates(rng, board, {
      type: 'constrained',
      constraint: { type: 'row', index: 1, display: 'Row 2' },
      candidates_count: 3, mode: 'choose' as const,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toEqual([1, 2])
  })
})

// ─── RNG ────────────────────────────────────────────────────────

describe('GameRng', () => {
  it('produces deterministic results', () => {
    const rng1 = new GameRng(123)
    const rng2 = new GameRng(123)
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next())
    }
  })

  it('int produces values in range', () => {
    const rng = new GameRng(42)
    for (let i = 0; i < 100; i++) {
      const val = rng.int(3, 7)
      expect(val).toBeGreaterThanOrEqual(3)
      expect(val).toBeLessThanOrEqual(7)
    }
  })

  it('shuffle returns all elements', () => {
    const rng = new GameRng(42)
    const arr = [1, 2, 3, 4, 5]
    const shuffled = rng.shuffle([...arr])
    expect(shuffled.sort()).toEqual(arr)
  })

  it('sample returns correct count', () => {
    const rng = new GameRng(42)
    const result = rng.sample([1, 2, 3, 4, 5], 3)
    expect(result).toHaveLength(3)
  })
})

// ─── Joker Re-Earning ───────────────────────────────────────────

describe('rollBasicJokerReEarn', () => {
  it('returns a basic joker type or null', () => {
    const rng = new GameRng(42)
    const results = Array.from({ length: 100 }, () => rollBasicJokerReEarn(rng))
    const earned = results.filter(r => r !== null)
    const nulls = results.filter(r => r === null)
    // Should have both some earned and some nulls (probabilistic, but with 100 trials very likely)
    expect(earned.length).toBeGreaterThan(0)
    expect(nulls.length).toBeGreaterThan(0)
    // All earned should be valid basic joker types
    for (const j of earned) {
      expect(['reshuffle_selection', 'reshuffle_question', 'reveal_hint', 'the_gambler']).toContain(j)
    }
  })
})

// ─── Special Joker Award ────────────────────────────────────────

describe('awardSpecialJoker', () => {
  it('awards from available types', () => {
    const rng = new GameRng(42)
    const player = makePlayer()
    const joker = awardSpecialJoker(rng, player)
    expect(['steal', 'curse', 'snipe', 'double_down']).toContain(joker)
  })

  it('returns null when all held', () => {
    const rng = new GameRng(42)
    const player = makePlayer({
      jokers: {
        ...makePlayer().jokers,
        steal: 1,
        curse: 1,
        snipe: 1,
        double_down: 1,
      },
    })
    expect(awardSpecialJoker(rng, player)).toBeNull()
  })

  it('does not award already held types', () => {
    const player = makePlayer({
      jokers: {
        ...makePlayer().jokers,
        steal: 1,
        curse: 1,
        snipe: 1,
        double_down: 0,
      },
    })
    // Only double_down is available
    for (let i = 0; i < 10; i++) {
      const result = awardSpecialJoker(new GameRng(i), player)
      expect(result).toBe('double_down')
    }
  })
})

// ─── Scramble Answer Order ──────────────────────────────────────

describe('scrambleAnswerOrder', () => {
  it('returns a permutation of correct length', () => {
    const rng = new GameRng(42)
    const order = scrambleAnswerOrder(rng, 4)
    expect(order).toHaveLength(4)
    expect(order.sort()).toEqual([0, 1, 2, 3])
  })
})

// ─── Boost and joker assignment ─────────────────────────────────

describe('assignBoostSlots', () => {
  it('never boosts the expertise slot — both sweeteners lure away from it', () => {
    const rng = new GameRng(1)
    for (let i = 0; i < 200; i++) {
      expect(assignBoostSlots(rng, true)).not.toContain(0)
      expect(assignBoostSlots(rng, false)).not.toContain(0)
    }
  })

  it('only ever returns valid slot indices', () => {
    const rng = new GameRng(1)
    for (let i = 0; i < 50; i++) {
      for (const idx of assignBoostSlots(rng, false)) {
        expect([1, 2, 3]).toContain(idx)
      }
    }
  })

  it('boosts a trailing player far more often than anyone else', () => {
    const runs = 500
    let base = 0
    let behind = 0
    const rng = new GameRng(42)
    for (let i = 0; i < runs; i++) {
      base += assignBoostSlots(rng, false).length
      behind += assignBoostSlots(rng, true).length
    }
    // ~8% vs ~35% per card, 3 eligible cards per run
    expect(behind).toBeGreaterThan(base * 2)
  })

  it('leaves most cards unboosted for a player who is not behind', () => {
    const runs = 500
    let boosted = 0
    const rng = new GameRng(7)
    for (let i = 0; i < runs; i++) boosted += assignBoostSlots(rng, false).length
    // well under a fifth of the 3 eligible cards per run
    expect(boosted).toBeLessThan(runs * 3 * 0.2)
  })
})

describe('assignJokerSlots', () => {
  it('always awards a joker on the hard slot', () => {
    const rng = new GameRng(3)
    for (let i = 0; i < 50; i++) {
      expect(assignJokerSlots(rng)).toContain(3)
    }
  })

  it('never awards a joker on the expertise slot, so the lure always costs something', () => {
    const rng = new GameRng(5)
    for (let i = 0; i < 200; i++) {
      expect(assignJokerSlots(rng)).not.toContain(0)
    }
  })

  it('sometimes, but not usually, marks a standard slot', () => {
    const rng = new GameRng(11)
    let marked = 0
    const runs = 400
    for (let i = 0; i < runs; i++) {
      const slots = assignJokerSlots(rng)
      marked += slots.filter((s) => s === 1 || s === 2).length
    }
    // ~35% of the 2 standard cards per run
    expect(marked).toBeGreaterThan(runs * 2 * 0.2)
    expect(marked).toBeLessThan(runs * 2 * 0.5)
  })
})

describe('pickSlot1Difficulty', () => {
  it('can hand a generic expertise an easy question', () => {
    const rng = new GameRng(9)
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(pickSlot1Difficulty(rng, false))
    expect(seen.has('easy')).toBe(true)
  })

  it('never hands a specific expertise an easy question', () => {
    const rng = new GameRng(9)
    for (let i = 0; i < 500; i++) {
      expect(pickSlot1Difficulty(rng, true)).not.toBe('easy')
    }
  })

  it('weights a specific expertise towards the hard end', () => {
    const rng = new GameRng(21)
    let hardish = 0
    const runs = 600
    for (let i = 0; i < runs; i++) {
      const d = pickSlot1Difficulty(rng, true)
      if (d === 'hard' || d === 'very_hard') hardish++
    }
    // 45 + 30 of 100 → about three quarters
    expect(hardish).toBeGreaterThan(runs * 0.6)
  })

  it('leaves the generic band mostly easy or medium', () => {
    const rng = new GameRng(33)
    let gentle = 0
    const runs = 600
    for (let i = 0; i < runs; i++) {
      const d = pickSlot1Difficulty(rng, false)
      if (d === 'easy' || d === 'medium') gentle++
    }
    // 35 + 35 of 100
    expect(gentle).toBeGreaterThan(runs * 0.55)
  })
})

describe('answer option order', () => {
  /**
   * The corpus puts the correct answer first in 13 of 16 multiple-choice
   * questions, so presenting options in file order would make "A" almost
   * always right. Display order therefore has to be randomised independently
   * of how the question stores its answer.
   */
  it('does not leave the options in file order', () => {
    let moved = 0
    const runs = 60
    for (let seed = 0; seed < runs; seed++) {
      const rng = new GameRng(seed)
      const order = rng.shuffle([0, 1, 2, 3])
      if (order[0] !== 0) moved++
    }
    // the correct answer should sit somewhere other than first most of the time
    expect(moved).toBeGreaterThan(runs * 0.5)
  })

  it('is a permutation — every option shown exactly once', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = new GameRng(seed)
      const order = rng.shuffle([0, 1, 2, 3])
      expect([...order].sort()).toEqual([0, 1, 2, 3])
    }
  })

  it('gives the pass player a different arrangement', () => {
    const rng = new GameRng(11)
    let differed = 0
    const runs = 40
    for (let i = 0; i < runs; i++) {
      const first = rng.shuffle([0, 1, 2, 3])
      const second = rng.shuffle([0, 1, 2, 3])
      if (first.join() !== second.join()) differed++
    }
    expect(differed).toBeGreaterThan(runs * 0.6)
  })
})

describe('placement rules', () => {
  const settings = {
    placement_candidates: 2,
    starting_pegs: 0,
    lines_to_win: 1,
    language: 'de',
  }

  it('lets the player choose when there is more than one candidate', () => {
    const rule = placementRuleForSlot(
      { slot_type: 'expertise', question_id: 'q', teaser_title: '', major_category: 'Science',
        difficulty: 'easy', constraint: null, has_2x_boost: false, awards_joker: false },
      settings,
    )
    expect(rule.mode).toBe('choose')
  })

  it('is automatic when the setting leaves only one candidate', () => {
    const rule = placementRuleForSlot(
      { slot_type: 'expertise', question_id: 'q', teaser_title: '', major_category: 'Science',
        difficulty: 'easy', constraint: null, has_2x_boost: false, awards_joker: false },
      { ...settings, placement_candidates: 1 },
    )
    expect(rule.mode).toBe('auto')
  })

  it('gives the second chance one automatic field, whatever the setting', () => {
    for (const count of [1, 2, 3, 4]) {
      const rule = passPlacementRule({ ...settings, placement_candidates: count })
      expect(rule.candidates_count).toBe(1)
      expect(rule.mode).toBe('auto')
    }
  })

  it('gives the Gambler three fields, all taken', () => {
    const rule = gamblerPlacementRule(settings)
    expect(rule.candidates_count).toBe(3)
    expect(rule.mode).toBe('auto')
  })
})

describe('generateSlots', () => {
  /** Mirrors the real corpus shape: plenty of medium, no very_hard at all. */
  function corpus(count: number) {
    const difficulties = ['easy', 'medium', 'medium', 'hard'] as const
    return Array.from({ length: count }, (_, i) => ({
      id: 'q' + i,
      languages: ['de', 'en'],
      major_category: i % 2 ? 'Science' : 'History',
      subcategory: i % 2 ? 'Physics' : 'World Wars',
      difficulty: difficulties[i % difficulties.length]!,
      question_type: 'multiple_choice' as const,
      time_limit_seconds: null,
      version: 1,
      created_at: '',
      generation_batch: null,
    }))
  }

  const player = {
    index: 0,
    name: 'Jonas',
    color: 'blue' as const,
    expertise: { major_categories: ['Science'], subcategories: ['Physics'] },
    board: { size: 4, fields: Array.from({ length: 4 }, () => Array(4).fill(false)), peg_count: 0 },
    jokers: {
      reshuffle_selection: 1, reshuffle_question: 1, reveal_hint: 1, the_gambler: 1,
      steal: 0, curse: 0, snipe: 0, double_down: 0,
    },
    stats: {
      questions_attempted: 0, questions_correct: 0, passes_received: 0,
      passes_correct: 0, jokers_used: 0, pegs_stolen_from: 0,
    },
    is_cursed: false,
  }

  const settings = {
    placement_candidates: 2,
    starting_pegs: 0,
    lines_to_win: 1,
    language: 'de',
  }

  it('always offers four slots, even though the corpus has no very_hard questions', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = new GameRng(seed)
      const slots = generateSlots(rng, corpus(24), player, settings, new Set(), false, [], [3])
      expect(slots).toHaveLength(4)
    }
  })

  it('still offers four when most of the corpus is already used', () => {
    const all = corpus(24)
    const used = new Set(all.slice(0, 22).map((q) => q.id))
    const rng = new GameRng(5)
    const slots = generateSlots(rng, all, player, settings, used, false, [], [3])
    expect(slots).toHaveLength(4)
  })

  it('keeps the slot types in order', () => {
    const rng = new GameRng(3)
    const slots = generateSlots(rng, corpus(24), player, settings, new Set(), false, [], [3])
    expect(slots.map((s) => s.slot_type)).toEqual(['expertise', 'standard', 'standard', 'hard'])
  })
})

// ─── Placement Rule ─────────────────────────────────────────────

describe('placementRuleForSlot', () => {
  const settings = {
    placement_candidates: 2,
    starting_pegs: 0,
    lines_to_win: 1,
    language: 'en',
  }

  it('returns free for hard slot (Slot 4)', () => {
    const slot: OfferedSlot = {
      slot_type: 'hard',
      question_id: 'q1',
      teaser_title: 'test',
      major_category: 'Science',
      difficulty: 'hard',
      constraint: null,
      has_2x_boost: false,
      awards_joker: false,
    }
    const rule = placementRuleForSlot(slot, settings)
    expect(rule.type).toBe('free')
  })

  it('returns constrained for standard slot', () => {
    const slot: OfferedSlot = {
      slot_type: 'standard',
      question_id: 'q1',
      teaser_title: 'test',
      major_category: 'Science',
      difficulty: 'medium',
      constraint: { type: 'row', index: 1, display: 'Row 2' },
      has_2x_boost: false,
      awards_joker: false,
    }
    const rule = placementRuleForSlot(slot, settings)
    expect(rule.type).toBe('constrained')
    expect(rule.constraint).toEqual({ type: 'row', index: 1, display: 'Row 2' })
    expect(rule.candidates_count).toBe(2)
  })

  it('returns random_board for expertise slot', () => {
    const slot: OfferedSlot = {
      slot_type: 'expertise',
      question_id: 'q1',
      teaser_title: 'test',
      major_category: 'Science',
      difficulty: 'easy',
      constraint: null,
      has_2x_boost: false,
      awards_joker: false,
    }
    const rule = placementRuleForSlot(slot, settings)
    expect(rule.type).toBe('random_board')
    expect(rule.candidates_count).toBe(2)
  })
})

describe('pickPlayerIntroLine', () => {
  const GENERIC: readonly string[] = GENERIC_PLAYER_INTRO_KEYS

  it('is deterministic for a given seed', () => {
    const a = pickPlayerIntroLine(new GameRng('seed-42'), 4)
    const b = pickPlayerIntroLine(new GameRng('seed-42'), 4)
    expect(a).toBe(b)
  })

  it('only ever returns a key that exists', () => {
    for (let count = 2; count <= 6; count++) {
      for (let seed = 0; seed < 40; seed++) {
        const key = pickPlayerIntroLine(new GameRng(`s${seed}`), count)
        const valid = GENERIC.includes(key) || key === `players_${count}`
        expect(valid, `${key} for ${count} players`).toBe(true)
      }
    }
  })

  it('never returns another roster size\'s line', () => {
    for (let seed = 0; seed < 60; seed++) {
      const key = pickPlayerIntroLine(new GameRng(`x${seed}`), 2)
      expect(key).not.toMatch(/^players_[3-6]$/)
    }
  })

  it('uses the generic lines most of the time, but does use the specific one', () => {
    let specific = 0
    const runs = 400
    for (let seed = 0; seed < runs; seed++) {
      if (pickPlayerIntroLine(new GameRng(`w${seed}`), 3) === 'players_3') specific++
    }
    // SPECIFIC_PLAYER_INTRO_CHANCE is 0.3; allow generous slack for a seeded PRNG.
    expect(specific).toBeGreaterThan(runs * 0.15)
    expect(specific).toBeLessThan(runs * 0.45)
  })

  it('falls back to generic lines for a roster with no specific line', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(GENERIC).toContain(pickPlayerIntroLine(new GameRng(`y${seed}`), 7))
    }
  })
})
