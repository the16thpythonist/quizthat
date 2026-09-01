import seedrandom from 'seedrandom'

/**
 * Wrapper around seedrandom for deterministic randomness.
 * All game randomness must go through this — never Math.random().
 */
export class GameRng {
  private rng: seedrandom.PRNG

  constructor(seed: number | string) {
    this.rng = seedrandom(String(seed))
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
