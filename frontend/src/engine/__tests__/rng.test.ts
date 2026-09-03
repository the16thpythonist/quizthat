import { describe, it, expect } from 'vitest'
import { GameRng } from '../rng'

describe('GameRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = new GameRng(1234)
    const b = new GameRng(1234)
    const draw = (r: GameRng) => [r.next(), r.int(0, 100), r.pick([1, 2, 3, 4, 5])]
    expect(draw(a)).toEqual(draw(b))
  })

  it('gives different sequences for different seeds', () => {
    expect(new GameRng(1).next()).not.toBe(new GameRng(2).next())
  })

  describe('saved state', () => {
    it('resumes mid-sequence rather than rewinding', () => {
      const original = new GameRng(42)
      original.next()
      original.next()
      original.next()
      const state = original.saveState()
      const remaining = [original.next(), original.next(), original.next()]

      const resumed = new GameRng(42, state)
      expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(remaining)
    })

    it('survives a JSON round-trip, as persistence and the wire both require', () => {
      const original = new GameRng(7)
      original.shuffle([1, 2, 3, 4, 5])
      const state = JSON.parse(JSON.stringify(original.saveState()))
      const remaining = [original.next(), original.next()]

      const resumed = new GameRng(7, state)
      expect([resumed.next(), resumed.next()]).toEqual(remaining)
    })

    it('reseeding without the state rewinds — the bug the state exists to prevent', () => {
      const original = new GameRng(99)
      const first = original.next()
      original.next()

      expect(new GameRng(99).next()).toBe(first)
    })

    it('treats a null state as a fresh sequence from the seed', () => {
      expect(new GameRng(5, null).next()).toBe(new GameRng(5).next())
    })
  })
})
