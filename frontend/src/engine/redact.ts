import type { GameSession } from '../types/session'

/**
 * Cut a session down to what one player is allowed to see.
 *
 * On a shared tablet, hidden information is enforced by the gate screens: only
 * one person is looking at the device at a time. On separate devices that
 * protection is gone, so it has to move into what each device is *sent* — a
 * guest cannot be shown a secret and asked not to look, because the network tab
 * shows it anyway.
 *
 * Two things are secret while a game is in progress:
 *
 * - **In-flight battle answers.** Everyone answers the same question before any
 *   of them is revealed, so seeing another player's guess would let you place
 *   yours next to it. Once the reveal is reached, every answer is public and
 *   this stops hiding them.
 * - **The pass.** The correct answer is deliberately withheld until the player
 *   one round behind has also answered (IDEA.md), so the pass state is trimmed
 *   for everyone but the two people it concerns.
 *
 * `viewerSeat` is null for a spectator — the TV shows the shared view, so it
 * gets exactly what a player with no stake would get: the redacted version.
 *
 * Pure and total: it copies rather than mutating, so the host's own session is
 * never damaged by preparing somebody else's view.
 */
export function redactSessionFor(session: GameSession, viewerSeat: number | null): GameSession {
  const battle = redactBattle(session, viewerSeat)
  const turn = redactTurn(session, viewerSeat)
  if (battle === session.battle && turn === session.turn) return session
  return { ...session, battle, turn }
}

function redactBattle(session: GameSession, viewerSeat: number | null): GameSession['battle'] {
  const battle = session.battle
  if (!battle) return null
  // At the reveal the ranking is the whole point; nothing is secret any more.
  if (battle.winner_index !== null || session.state === 'battle_reveal') return battle
  const answers = battle.answers.filter((answer) => answer.player_index === viewerSeat)
  if (answers.length === battle.answers.length) return battle
  return { ...battle, answers }
}

function redactTurn(session: GameSession, viewerSeat: number | null): GameSession['turn'] {
  const turn = session.turn
  if (!turn?.pass) return turn ?? null
  // The active player and the player inheriting the question both already know
  // where it stands; everyone else finds out at the resolve screen.
  const involved =
    viewerSeat === turn.active_player_index || viewerSeat === turn.pass.pass_player_index
  if (involved || turn.pass.result !== null) return turn
  return { ...turn, pass: { ...turn.pass, result: null, scrambled_order: [] } }
}

/**
 * One redacted session per recipient, keyed by whatever identifies them.
 *
 * The host publishes this whole map in a single request, so every device moves
 * to the same version at the same time — sending them one by one would let a
 * player see the next state before the person whose turn it is.
 */
export function redactForAll<K extends string>(
  session: GameSession,
  recipients: { key: K; seat: number | null }[],
): Record<K, GameSession> {
  const out = {} as Record<K, GameSession>
  for (const recipient of recipients) {
    out[recipient.key] = redactSessionFor(session, recipient.seat)
  }
  return out
}
