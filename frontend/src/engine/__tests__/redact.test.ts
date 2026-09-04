import { describe, it, expect } from 'vitest'
import { redactSessionFor, redactForAll } from '../redact'
import { createSession } from '../../stores/game'
import type { BattleState, GameSession, TurnState } from '../../types/session'

function battle(partial: Partial<BattleState> = {}): BattleState {
  return {
    question_id: 'b1',
    challenger_index: null,
    question_type: 'estimation',
    order: [0, 1, 2],
    answers: [],
    transfer: null,
    winner_index: null,
    loser_index: null,
    ...partial,
  }
}

function turn(partial: Partial<TurnState> = {}): TurnState {
  return {
    active_player_index: 0,
    previous_round_player_index: 1,
    phase: 'question_display',
    offered_slots: [],
    selected_slot_index: null,
    selected_question_id: null,
    boosted_slot_indices: [],
    curse_active: false,
    double_down_active: false,
    hint_revealed: false,
    jokers_used_this_turn: new Set(),
    pegs_remaining: 0,
    placement_rule: null,
    placing_player_index: 0,
    gambler_staked_field: null,
    pass: null,
    special_joker_earned: null,
    basic_joker_earned: null,
    candidate_fields: [],
    answer_order: [],
    joker_awarded: null,
    gambler_won: false,
    ...partial,
  }
}

function sessionWith(partial: Partial<GameSession>): GameSession {
  return { ...createSession(), status: 'in_progress', ...partial }
}

describe('redactSessionFor', () => {
  describe('battle answers', () => {
    const inFlight = sessionWith({
      state: 'battle_answering',
      battle: battle({
        answers: [
          { player_index: 0, value: 100, distance: 5 },
          { player_index: 1, value: 900, distance: 795 },
        ],
      }),
    })

    it('hides other players guesses while the battle is still running', () => {
      const seen = redactSessionFor(inFlight, 1)
      expect(seen.battle!.answers).toHaveLength(1)
      expect(seen.battle!.answers[0]!.player_index).toBe(1)
    })

    it('keeps the viewer own guess, so their screen can show it back', () => {
      const seen = redactSessionFor(inFlight, 0)
      expect(seen.battle!.answers[0]!.value).toBe(100)
    })

    it('shows a spectator nothing in flight', () => {
      // The TV is in the room with everyone; it must not leak a guess either.
      expect(redactSessionFor(inFlight, null).battle!.answers).toHaveLength(0)
    })

    it('reveals every answer once the battle resolves', () => {
      const resolved = sessionWith({
        state: 'battle_reveal',
        battle: battle({
          answers: [
            { player_index: 0, value: 100, distance: 5 },
            { player_index: 1, value: 900, distance: 795 },
          ],
          winner_index: 0,
          loser_index: 1,
        }),
      })
      expect(redactSessionFor(resolved, 1).battle!.answers).toHaveLength(2)
      expect(redactSessionFor(resolved, null).battle!.answers).toHaveLength(2)
    })
  })

  describe('the pass', () => {
    const passing = sessionWith({
      state: 'pass_answering',
      turn: turn({
        active_player_index: 0,
        pass: {
          pass_player_index: 1,
          original_answer_index: 2,
          scrambled_order: [3, 1, 0, 2],
          result: null,
        },
      }),
    })

    it('is visible to the player who got the question wrong', () => {
      expect(redactSessionFor(passing, 0).turn!.pass!.scrambled_order).toHaveLength(4)
    })

    it('is visible to the player inheriting it', () => {
      expect(redactSessionFor(passing, 1).turn!.pass!.scrambled_order).toHaveLength(4)
    })

    it('is trimmed for everyone else while it is still open', () => {
      const seen = redactSessionFor(passing, 2)
      expect(seen.turn!.pass!.scrambled_order).toEqual([])
      expect(seen.turn!.pass!.result).toBeNull()
    })

    it('opens up once it has been resolved', () => {
      const resolved = sessionWith({
        state: 'pass_resolve',
        turn: turn({
          pass: {
            pass_player_index: 1,
            original_answer_index: 2,
            scrambled_order: [3, 1, 0, 2],
            result: 'wrong',
          },
        }),
      })
      expect(redactSessionFor(resolved, 2).turn!.pass!.scrambled_order).toHaveLength(4)
    })
  })

  describe('what it must not do', () => {
    it('never mutates the session it was given', () => {
      const original = sessionWith({
        state: 'battle_answering',
        battle: battle({ answers: [{ player_index: 0, value: 1, distance: 1 }] }),
      })
      redactSessionFor(original, 1)
      // The host redacts for everyone else from its own live session; damaging
      // it here would corrupt the game rather than one view of it.
      expect(original.battle!.answers).toHaveLength(1)
    })

    it('leaves the boards, jokers and scores alone', () => {
      // All of that is public by design — IDEA.md wants every board visible so
      // Snipe and Duel can be aimed.
      const full = sessionWith({
        state: 'battle_answering',
        players: createSession().players,
        battle: battle({ answers: [{ player_index: 0, value: 1, distance: 1 }] }),
      })
      const seen = redactSessionFor(full, 1)
      expect(seen.players).toBe(full.players)
      expect(seen.settings).toBe(full.settings)
      expect(seen.round).toBe(full.round)
    })

    it('returns the same object when there is nothing to hide', () => {
      const quiet = sessionWith({ state: 'selection', turn: turn() })
      expect(redactSessionFor(quiet, 0)).toBe(quiet)
    })
  })

  describe('redactForAll', () => {
    it('produces one view per recipient in a single pass', () => {
      const source = sessionWith({
        state: 'battle_answering',
        battle: battle({
          answers: [
            { player_index: 0, value: 10, distance: 1 },
            { player_index: 1, value: 20, distance: 2 },
          ],
        }),
      })
      const views = redactForAll(source, [
        { key: 'tok-a', seat: 0 },
        { key: 'tok-b', seat: 1 },
        { key: 'tok-tv', seat: null },
      ])
      expect(views['tok-a'].battle!.answers.map((a) => a.player_index)).toEqual([0])
      expect(views['tok-b'].battle!.answers.map((a) => a.player_index)).toEqual([1])
      expect(views['tok-tv'].battle!.answers).toEqual([])
    })
  })
})
