import { openDB, type IDBPDatabase } from 'idb'
import type { GameSession } from '../types/session'

const DB_NAME = 'quizthat'
const DB_VERSION = 1
const STORE_NAME = 'sessions'
const ACTIVE_SESSION_KEY = 'active'
const SEEN_QUESTIONS_STORE = 'seen_questions'

interface QuizThatDB {
  sessions: {
    key: string
    value: SerializedSession
  }
  seen_questions: {
    key: string
    value: { question_id: string; last_seen: string }
  }
}

/**
 * Serializable version of GameSession (Sets -> Arrays for JSON/IndexedDB).
 */
interface SerializedSession {
  data: Omit<GameSession, 'used_question_ids' | 'turn'> & {
    used_question_ids: string[]
    turn: SerializedTurnState | null
  }
}

interface SerializedTurnState {
  [key: string]: unknown
  jokers_used_this_turn: string[]
}

let dbPromise: Promise<IDBPDatabase<QuizThatDB>> | null = null

function getDB(): Promise<IDBPDatabase<QuizThatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QuizThatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
        if (!db.objectStoreNames.contains(SEEN_QUESTIONS_STORE)) {
          db.createObjectStore(SEEN_QUESTIONS_STORE)
        }
      },
    })
  }
  return dbPromise
}

/** Serialize a GameSession for IndexedDB storage. */
function serialize(session: GameSession): SerializedSession {
  const turnData = session.turn
    ? {
        ...session.turn,
        jokers_used_this_turn: Array.from(session.turn.jokers_used_this_turn),
      }
    : null

  return {
    data: {
      ...session,
      used_question_ids: Array.from(session.used_question_ids),
      turn: turnData as SerializedTurnState | null,
    },
  }
}

/** Deserialize a stored session back to a GameSession. */
function deserialize(stored: SerializedSession): GameSession {
  const data = stored.data
  const turn = data.turn
    ? {
        ...data.turn,
        jokers_used_this_turn: new Set(data.turn.jokers_used_this_turn as unknown as string[]),
      }
    : null

  return {
    ...data,
    used_question_ids: new Set(data.used_question_ids),
    turn,
  } as GameSession
}

/** Save a session to IndexedDB. */
export async function saveSession(session: GameSession): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, serialize(session), ACTIVE_SESSION_KEY)
}

/** Load the active session from IndexedDB. Returns null if none exists. */
export async function loadSession(): Promise<GameSession | null> {
  const db = await getDB()
  const stored = await db.get(STORE_NAME, ACTIVE_SESSION_KEY)
  if (!stored) return null
  return deserialize(stored)
}

/** Delete the active session from IndexedDB. */
export async function deleteSession(): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, ACTIVE_SESSION_KEY)
}

// ─── Debounced Auto-Save ────────────────────────────────────────

let pendingSnapshot: GameSession | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500

/**
 * Take a snapshot and schedule a debounced write.
 * The in-memory snapshot is synchronous (structuredClone).
 * The actual IndexedDB write is debounced at 500ms trailing.
 */
export function scheduleAutoSave(session: GameSession): void {
  // Synchronous in-memory snapshot
  pendingSnapshot = structuredClone(session)

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    flushAutoSave()
  }, DEBOUNCE_MS)
}

/**
 * Immediately flush the pending auto-save.
 * Called on visibilitychange / pagehide.
 */
export function flushAutoSave(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (pendingSnapshot) {
    const snapshot = pendingSnapshot
    pendingSnapshot = null
    saveSession(snapshot).catch(err => {
      console.error('Auto-save failed:', err)
    })
  }
}

/** Record a seen question for cross-session depletion. */
export async function recordSeenQuestion(questionId: string): Promise<void> {
  const db = await getDB()
  await db.put(SEEN_QUESTIONS_STORE, {
    question_id: questionId,
    last_seen: new Date().toISOString(),
  }, questionId)
}

/** Get all seen question IDs. */
export async function getSeenQuestions(): Promise<Set<string>> {
  const db = await getDB()
  const keys = await db.getAllKeys(SEEN_QUESTIONS_STORE)
  return new Set(keys as string[])
}

// ─── Lifecycle Hooks ────────────────────────────────────────────

/**
 * Set up event listeners for immediate flush on app backgrounding.
 * Call this once at app initialization.
 */
export function setupAutoSaveListeners(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAutoSave()
    }
  })

  window.addEventListener('pagehide', () => {
    flushAutoSave()
  })
}
