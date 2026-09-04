import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { GameIntent } from './game'
import { useGameStore } from './game'
import { redactForAll } from '../engine/redact'
import { useCorpusStore } from './corpus'
import { PLAYER_COLORS } from '../types/session'
import type { PlayerColor } from '../types/session'
import { deserializeSession, serializeSession } from './persistence'
import type { SerializedSession } from './persistence'

/** A member of the lobby, as everyone in it sees them. */
export interface LobbyMember {
  id: number
  nickname: string
  role: 'player' | 'spectator'
  is_host: boolean
  seat: number | null
  joined_at: string
}

export interface LobbyState {
  code: string
  /** What the game is called at the table. Display only — joining uses the code. */
  name: string
  status: 'open' | 'playing' | 'finished'
  members: LobbyMember[]
}

/**
 * A game as it appears in the watch list.
 *
 * Note what is missing: the join code. The list exists so a television can pick
 * a game without typing, and publishing codes here would let anyone reach the
 * server and join any game as a player without being told one.
 */
export interface OpenLobby {
  id: number
  name: string
  status: 'open' | 'playing'
  player_count: number
  created_at: string
}

/**
 * What this device is doing.
 *
 * 'broadcast' is a shared-tablet game publishing itself so a television can
 * follow along. It is authoritative like a host, but every seat is played on
 * this one device — so none of the per-seat gating that governs a multi-device
 * game applies to it.
 */
export type NetRole = 'offline' | 'broadcast' | 'host' | 'guest' | 'spectator'

const API = '/api/lobbies'

/**
 * How long the host waits before sending, after the session last changed.
 *
 * Long enough to coalesce the several mutations one action produces, short
 * enough that nobody notices the delay on the other phones.
 */
const PUBLISH_DEBOUNCE_MS = 120

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API}${path}`, { ...init, headers })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      detail = (await response.json()).detail ?? detail
    } catch {
      /* the body was not JSON; the status is all we have */
    }
    throw new Error(detail)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/**
 * The transport for multi-device play.
 *
 * Offline is the default and needs none of this. Online, exactly one device is
 * the **host**: it runs the same engine it would run on a shared tablet, and
 * everyone else sends it intents and renders the state it publishes. The server
 * relays; it does not decide anything.
 *
 * The important consequence is that the game logic is not forked. A host device
 * behaves identically in both modes, and a guest's tap reaches the very same
 * store action — just by a longer route.
 */
export const useNetStore = defineStore('net', () => {
  const game = useGameStore()

  const role = ref<NetRole>('offline')
  const code = ref('')
  const token = ref('')
  const memberId = ref<number | null>(null)
  const seat = ref<number | null>(null)
  const lobby = ref<LobbyState | null>(null)
  const error = ref<string | null>(null)
  const connected = ref(false)

  const source = shallowRef<EventSource | null>(null)
  /** Bumped on every publish so guests can tell a new state from a repeat. */
  let version = 0
  let wakeLock: WakeLockSentinel | null = null

  /** Seats are gated: several devices share one game. */
  const isMultiDevice = computed(() =>
    role.value === 'host' || role.value === 'guest' || role.value === 'spectator',
  )
  /** Connected to a lobby at all — including a broadcasting tablet. */
  const isOnline = computed(() => role.value !== 'offline')
  /** Runs the engine and publishes. A broadcasting tablet does both. */
  const isHost = computed(() => role.value === 'host' || role.value === 'broadcast')
  const isBroadcasting = computed(() => role.value === 'broadcast')

  /**
   * Whether this device may act on the state in front of it.
   *
   * The single gate for the whole app. Screens are mirrored on a device that
   * cannot act, and mirroring is not passive: PegPlacementScreen places pegs
   * from a watcher when the reveal settles, and JokerTargetSheet curses an
   * opponent on mount. Blocking taps would not stop either of those, so the
   * check belongs here, where every action already passes through.
   */
  const canActNow = computed(() => {
    if (!isMultiDevice.value) return true // one device, playing every seat
    if (role.value === 'spectator') return false
    // Announcements belong to nobody in particular; the host drives them so a
    // slow phone cannot hold up the table.
    if (game.awaitingSeat === null) return isHost.value
    return seat.value === game.awaitingSeat
  })
  const players = computed(() => lobby.value?.members.filter((m) => m.role === 'player') ?? [])
  const spectators = computed(
    () => lobby.value?.members.filter((m) => m.role === 'spectator') ?? [],
  )

  // ─── Joining ──────────────────────────────────────────────────

  function adopt(payload: { lobby: LobbyState; member: LobbyMember & { token: string } }) {
    lobby.value = payload.lobby
    code.value = payload.lobby.code
    token.value = payload.member.token
    memberId.value = payload.member.id
    seat.value = payload.member.seat
    role.value = payload.member.is_host
      ? 'host'
      : payload.member.role === 'spectator'
        ? 'spectator'
        : 'guest'
  }

  async function createLobby(nickname: string, name = '') {
    error.value = null
    adopt(
      await request('/', { method: 'POST', body: JSON.stringify({ nickname, name }) }),
    )
    connect()
  }

  /**
   * Publish a shared-tablet game so a television can follow it.
   *
   * Entirely best-effort. Playing round a tablet must keep working with no
   * server at all — that is the whole point of the offline mode — so a failure
   * here is swallowed and the game carries on exactly as before.
   *
   * The device stays authoritative and keeps playing every seat; it simply also
   * sends what it is doing. Remote players cannot join (the server refuses them
   * on a local lobby); spectators can.
   */
  async function startBroadcast(name: string) {
    if (role.value !== 'offline') return
    try {
      const payload = await request<{
        lobby: LobbyState
        member: LobbyMember & { token: string }
      }>('/', {
        method: 'POST',
        body: JSON.stringify({ nickname: name || 'Tisch', name, local: true }),
      })
      lobby.value = payload.lobby
      code.value = payload.lobby.code
      token.value = payload.member.token
      memberId.value = payload.member.id
      seat.value = null
      role.value = 'broadcast'
      connect()
      schedulePublish()
    } catch {
      /* no server, or it said no: the game is played on this device anyway */
    }
  }

  /** The games a television could watch. No codes; see OpenLobby. */
  async function listOpenLobbies(): Promise<OpenLobby[]> {
    return request<OpenLobby[]>('/open/')
  }

  /**
   * Watch a game picked from the list.
   *
   * By id rather than by code, and it can only ever produce a spectator — so a
   * TV gets from the main menu to watching without typing anything.
   */
  async function watchLobby(lobbyId: number) {
    error.value = null
    adopt(await request(`/watch/${lobbyId}/`, { method: 'POST', body: '{}' }))
    connect()
  }

  async function joinLobby(joinCode: string, nickname: string, asSpectator = false) {
    error.value = null
    const clean = joinCode.trim().toUpperCase()
    adopt(
      await request(`/${clean}/join/`, {
        method: 'POST',
        body: JSON.stringify({ nickname, role: asSpectator ? 'spectator' : 'player' }),
      }),
    )
    connect()
  }

  /** Host only: close the lobby to new players and fix the seat order. */
  async function startLobby() {
    lobby.value = await request(`/${code.value}/start/`, { method: 'POST' }, token.value)
  }

  async function leave() {
    if (code.value && token.value) {
      await request(`/${code.value}/leave/`, { method: 'POST' }, token.value).catch(() => {
        /* leaving is best-effort; the lobby expires anyway */
      })
    }
    disconnect()
    role.value = 'offline'
    code.value = ''
    token.value = ''
    memberId.value = null
    seat.value = null
    lobby.value = null
  }

  // ─── The stream ───────────────────────────────────────────────

  function connect() {
    disconnect()
    // EventSource cannot set headers, so the token rides in the query string.
    // It is an opaque random credential, not personal data, and this is the one
    // endpoint that has no alternative.
    const stream = new EventSource(
      `${API}/${code.value}/events/?token=${encodeURIComponent(token.value)}`,
    )
    source.value = stream

    stream.addEventListener('open', () => {
      connected.value = true
      error.value = null
    })
    stream.addEventListener('error', () => {
      // EventSource reconnects on its own; surface it without tearing down.
      connected.value = false
    })
    stream.addEventListener('lobby', (event) => {
      lobby.value = JSON.parse((event as MessageEvent).data)
      const me = lobby.value?.members.find((m) => m.id === memberId.value)
      if (me) seat.value = me.seat
      void seatLatecomers()
      // Whoever just arrived has no snapshot yet, and the game may sit
      // untouched for a minute while somebody reads a question — so publish on
      // the roster changing, not only on the state changing. Without this a
      // television that joined mid-game waits in the lobby until the next move.
      schedulePublish()
    })
    stream.addEventListener('snapshot', (event) => {
      if (isHost.value) return // the host is the authority; it never adopts one
      applySnapshot(JSON.parse((event as MessageEvent).data))
    })
    stream.addEventListener('intent', (event) => {
      if (!isHost.value) return
      const { intent } = JSON.parse((event as MessageEvent).data)
      void applyRemoteIntent(intent)
    })
    stream.addEventListener('closed', () => {
      error.value = 'The lobby has closed.'
      disconnect()
    })
  }

  function disconnect() {
    source.value?.close()
    source.value = null
    connected.value = false
  }

  // ─── Host side ────────────────────────────────────────────────

  /**
   * Apply an intent that arrived from another device.
   *
   * Guarded twice over. The seat is attached by the server, not claimed in the
   * payload, so it cannot be forged by the sender; and the store's own
   * `_setState` refuses anything illegal for the current state — the same check
   * that protects a local tap, because it is the same call.
   */
  async function applyRemoteIntent(intent: GameIntent & { seat?: number | null }) {
    try {
      await game.dispatch(intent)
    } catch (err) {
      // One bad intent must not stop the game; the sender simply sees nothing
      // happen, which is the correct outcome for an illegal move.
      console.warn('Refused a remote intent:', intent.type, err)
    }
    // The publish is left to the watcher below rather than done here, because
    // several actions finish after they return: proceedFromTurnGate fetches its
    // four questions without awaiting them, so publishing on the way out would
    // send everyone a selection screen with no cards on it.
  }

  /**
   * Add anyone who joined after the game started.
   *
   * The server seats a latecomer at the end of the turn order; the host is what
   * turns that seat into a player with a board. Driven off the roster event
   * rather than a dedicated message, because the roster is already the thing
   * that changes when somebody arrives.
   *
   * They start on an empty board, which in a game several rounds old is a real
   * disadvantage — left uncompensated on purpose, since the 2x boost already
   * favours whoever has answered fewest correctly (IDEA.md).
   */
  async function seatLatecomers() {
    if (!isHost.value || game.status !== 'in_progress') return
    const waiting = players.value
      .filter((member) => member.seat !== null && member.seat >= game.players.length)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
    for (const member of waiting) {
      // Seats are contiguous and never move, so a gap would mean the roster and
      // the game had already diverged — adding out of order would cement it.
      if (member.seat !== game.players.length) break
      await game.dispatch({
        type: 'addPlayer',
        args: [
          member.nickname,
          PLAYER_COLORS[member.seat] as PlayerColor,
          { major_categories: [], subcategories: [] },
        ],
      })
    }
  }

  /**
   * Publish whenever the session changes, coalescing a burst into one send.
   *
   * A turn produces several mutations in quick succession — place a peg, check
   * the win, advance the player — and each of those is a state every other
   * device would otherwise have to render on its way past.
   */
  let publishTimer: ReturnType<typeof setTimeout> | null = null
  function schedulePublish() {
    if (!isHost.value) return
    if (publishTimer) clearTimeout(publishTimer)
    publishTimer = setTimeout(() => {
      publishTimer = null
      void publish()
    }, PUBLISH_DEBOUNCE_MS)
  }

  /**
   * Send the current state to everyone, redacted per recipient.
   *
   * One request carrying every view, so all devices move to the same version
   * together — publishing one at a time would let somebody see the next state
   * before the player whose turn it is.
   */
  async function publish() {
    if (!isHost.value || !lobby.value) return
    version += 1
    // Addressed by member id: a token is a credential, and the host has no
    // business holding anybody else's just to name them.
    const views = redactForAll(
      game.session,
      lobby.value.members.map((member) => ({
        key: String(member.id),
        seat: member.role === 'spectator' ? null : member.seat,
      })),
    )
    const snapshots: Record<string, SerializedSession> = {}
    for (const [id, view] of Object.entries(views)) {
      snapshots[id] = serializeSession(view)
    }
    await request(
      `/${code.value}/snapshot/`,
      { method: 'POST', body: JSON.stringify({ version, snapshots }) },
      token.value,
    ).catch((err) => {
      console.warn('Could not publish the state:', err)
    })
  }

  /**
   * Keep the host's screen awake.
   *
   * The lobby creator runs the engine, so a locked phone stalls the game for
   * everyone. The lock is best-effort — unsupported on some browsers, and
   * dropped whenever the tab is backgrounded — so it is re-taken on focus
   * rather than assumed to hold.
   */
  async function holdScreenAwake() {
    if (!isHost.value) return
    try {
      wakeLock = await navigator.wakeLock?.request('screen')
    } catch {
      /* denied or unsupported: the game still works, it just needs a tap */
    }
  }

  function releaseScreen() {
    void wakeLock?.release()
    wakeLock = null
  }

  // ─── Guest side ───────────────────────────────────────────────

  function applySnapshot(payload: { version: number; session: SerializedSession }) {
    if (payload.version <= version) return // a repeat, or an out-of-order arrival
    version = payload.version
    game.loadSessionState(deserializeSession(payload.session))
    void syncQuestion()
  }

  /**
   * Fetch the question the snapshot refers to.
   *
   * The session carries the question's *id*, not its text — it is corpus
   * payload, the same on every device, and shipping it inside every snapshot
   * would put the answer on the wire many times over. So each device loads it
   * from the corpus itself, exactly as the host does.
   */
  let loadedQuestionId: string | null = null

  async function syncQuestion() {
    const id = game.battle?.question_id ?? game.turn?.selected_question_id ?? null
    if (!id) {
      loadedQuestionId = null
      return
    }
    if (id === loadedQuestionId && game.currentQuestion) return
    const corpus = useCorpusStore()
    const data = await corpus.fetchQuestionData(id, game.settings.language)
    if (data) {
      game.setQuestionData(data)
      loadedQuestionId = id
    }
  }

  /**
   * Send one action.
   *
   * The single entry point every screen uses, so no screen needs to know which
   * mode it is in: offline and the host apply locally, everyone else posts.
   */
  async function act(intent: GameIntent) {
    if (!canActNow.value) return
    if (role.value === 'offline') {
      await game.dispatch(intent)
      return
    }
    if (isHost.value) {
      await game.dispatch(intent)
      return // the watcher publishes, once the action has fully settled
    }
    await request(
      `/${code.value}/intents/`,
      { method: 'POST', body: JSON.stringify({ intent }) },
      token.value,
    ).catch((err) => {
      error.value = err instanceof Error ? err.message : String(err)
    })
  }

  /**
   * Record the finished game for the leaderboard.
   *
   * Sent once, by the host, keyed on the session id — a host that reconnects
   * and sends again is answered with the existing record rather than counting
   * the game twice.
   */
  async function reportResult() {
    if (!isHost.value || !lobby.value) return
    const bySeat = new Map(nicknamesBySeat())
    await fetch(`/api/stats/report/${code.value}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        session_id: game.sessionId,
        rounds: game.round,
        players: game.players.map((player) => ({
          nickname: bySeat.get(player.index) ?? player.name,
          seat: player.index,
          color: player.color,
          won: player.index === game.winnerPlayerIndex,
          pegs: player.board.peg_count,
          questions_attempted: player.stats.questions_attempted,
          questions_correct: player.stats.questions_correct,
          jokers_used: player.stats.jokers_used,
        })),
      }),
    }).catch((err) => console.warn('Could not record the result:', err))
  }

  /**
   * Seat to lobby nickname.
   *
   * The stats profile is keyed on the nickname somebody joined with, not on the
   * name the game happens to be showing — those can differ, and the leaderboard
   * has to agree with what was typed in the lobby.
   */
  function nicknamesBySeat(): [number, string][] {
    return players.value
      .filter((member) => member.seat !== null)
      .map((member) => [member.seat as number, member.nickname])
  }

  watch(() => game.session, schedulePublish, { deep: true })

  /**
   * A broadcast belongs to one game, so it ends with it.
   *
   * Resetting returns the store to 'setup'; leaving here closes the lobby so it
   * stops appearing in the watch list as a game nobody is playing.
   */
  watch(
    () => game.status,
    (status) => {
      if (status === 'setup' && isBroadcasting.value) void leave()
    },
  )

  /**
   * A broadcast belongs to one game, so it ends with it.
   *
   * Reset returns the store to 'setup'; leaving here closes the lobby and stops
   * it appearing in the watch list as a game nobody is playing.
   */
  watch(
    () => game.status,
    (status) => {
      if (status === 'setup' && isBroadcasting.value) void leave()
    },
  )

  watch(
    () => game.state,
    (state) => {
      if (state === 'victory' && isHost.value) void reportResult()
    },
  )

  return {
    role,
    code,
    token,
    memberId,
    seat,
    lobby,
    error,
    connected,
    isOnline,
    isMultiDevice,
    isHost,
    isBroadcasting,
    canActNow,
    players,
    spectators,
    createLobby,
    startBroadcast,
    joinLobby,
    listOpenLobbies,
    watchLobby,
    startLobby,
    leave,
    connect,
    disconnect,
    act,
    publish,
    holdScreenAwake,
    releaseScreen,
    reportResult,
  }
})
