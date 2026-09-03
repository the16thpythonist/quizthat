import seedrandom from 'seedrandom'

/**
 * Wrapper around seedrandom for deterministic randomness.
 * All game randomness must go through this — never Math.random().
 */
/**
 * A generator's position in its sequence, as a plain object.
 *
 * Opaque — it is seedrandom's internal ARC4 state, and only ever produced by
 * `GameRng.saveState()` and consumed by the constructor.
 */
export type GameRngState = Record<string, unknown>

/**
 * seedrandom's bundled types predate its own state API: `PRNG` does not declare
 * `.state()`, and the options type only accepts its internal `Arc4` class where
 * a restored plain state object belongs. Both casts are confined to this file
 * and covered by the round-trip tests in `__tests__/rng.test.ts`.
 */
type StatefulPRNG = seedrandom.PRNG & { state(): GameRngState }

export class GameRng {
  private rng: StatefulPRNG

  /**
   * Restores an exact position when `state` is given, otherwise starts a fresh
   * sequence from `seed`.
   *
   * Reseeding alone would rewind the generator, so a resumed or relayed game
   * would re-draw the sequence it had already spent. Both a saved game and a
   * snapshot sent to another device therefore carry the state, not just the
   * seed.
   */
  constructor(seed: number | string, state?: GameRngState | null) {
    this.rng = (
      state
        ? seedrandom('', { state: state as never })
        : seedrandom(String(seed), { state: true })
    ) as StatefulPRNG
  }

  /** The current position, for storing alongside the seed. */
  saveState(): GameRngState {
    return this.rng.state()
  }

  /** Returns a float in [0, 1). */
  next(): number {
    return this.rng()
  }

  /** Returns an integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T
  }

  /** Shuffle an array in place (Fisher-Yates). Returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const tmp = arr[i]!
      arr[i] = arr[j]!
      arr[j] = tmp
    }
    return arr
  }

  /** Pick N unique random elements from an array. */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr]
    this.shuffle(copy)
    return copy.slice(0, n)
  }

  /** Roll against a probability (0-1). Returns true with that probability. */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  /**
   * Weighted random selection.
   * weights[i] is the relative weight for items[i].
   */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((sum, w) => sum + w, 0)
    let roll = this.next() * total
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i]!
      if (roll <= 0) return items[i] as T
    }
    return items[items.length - 1] as T
  }
}
