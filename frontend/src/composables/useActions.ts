import { useNetStore } from '../stores/net'
import type { GameIntent, GameIntentMap } from '../stores/game'

/**
 * How screens take an action, in either mode.
 *
 * `act.selectSlot(2)` reads like the store call it replaces, but it goes
 * through the transport: offline and on the host it applies locally, and on a
 * guest it is posted to the relay and applied by the host. A screen therefore
 * never needs to know which mode it is in — which is the whole reason
 * multi-device did not fork the game logic.
 *
 * A Proxy rather than a hand-written wrapper per action: the intent map is
 * already the complete vocabulary, so writing them out again would be a second
 * list to keep in step. The cast is what tells TypeScript the proxy answers to
 * exactly that map, and `GameIntentMap` is enforced against the real handlers,
 * so a typo in a name here is still a compile error.
 */
export function useActions(): GameIntentMap {
  const net = useNetStore()
  return new Proxy({} as GameIntentMap, {
    get(_target, type: string) {
      return (...args: unknown[]) => net.act({ type, args } as GameIntent)
    },
  })
}
