/**
 * The editor's half of the corpus API.
 *
 * Separate from `stores/corpus.ts`, which is the game's reader and deliberately
 * knows nothing about signing in. This one talks to `/api/corpus/*` on the
 * Django relay, carries the session cookie, and is the only place that writes.
 */

import type { Difficulty, QuestionMeta, QuestionType } from '../types/session'

const BASE = '/api/corpus'

export interface SessionState {
  configured: boolean
  signed_in: boolean
}

/** One question as the middle pane lists it. */
export interface ListEntry {
  id: string
  major_category: string
  subcategory: string
  difficulty: string
  question_type: string
  languages: string[]
  present_languages: string[]
  time_limit_seconds: number | null
  has_audio: boolean
  /** False for a generated question nobody has looked at yet. */
  reviewed: boolean
  titles: Record<string, string>
}

/** A category the pipeline can generate into, with what the corpus already holds. */
export interface GenCategory {
  name: string
  count: number
  subcategories: { name: string; count: number }[]
}

/** Why generation is or is not possible on this server. */
export interface Capability {
  available: boolean
  reasons: string[]
  pipeline: string | null
  claude: string | null
  questions_dir: string
  max_count: number
}

export interface RunSummary {
  id: string
  status: 'running' | 'finished' | 'failed' | 'stopped'
  error: string | null
  params: Record<string, unknown>
  started_at: number
  finished_at: number | null
  event_count: number
}

/** One line of the pipeline's event stream. `event` names the kind. */
export interface RunEvent {
  event: string
  [key: string]: unknown
}

export interface RunRequest {
  category: string
  subcategory: string
  difficulty: string
  question_type: string
  count: number
  languages: string[]
  model?: string
  dry_run?: boolean
}

export interface TreeNode {
  major: string
  count: number
  subcategories: { name: string; count: number }[]
}

export interface Facets {
  major_category: string[]
  difficulty: string[]
  question_type: string[]
  language: string[]
}

export interface AudioClip {
  name: string
  kind: string
  language: string
  bytes: number
}

/** The per-language file. `answer_data` stays loose — its shape follows the type. */
export interface QuestionBody {
  teaser_title: string
  question_text: string
  hint: string | null
  answer_data: Record<string, unknown>
  [key: string]: unknown
}

export interface Bundle {
  id: string
  meta: QuestionMeta
  present_languages: string[]
  languages: Record<string, QuestionBody>
  audio: AudioClip[]
}

/** The fields the editor is allowed to change; the server merges the rest back. */
export interface MetaPatch {
  major_category: string
  subcategory: string
  difficulty: Difficulty
  question_type: QuestionType
  time_limit_seconds: number | null
}

/**
 * A failed request, carrying what the server said.
 *
 * The server's `detail` is written for a person — "question_text cannot be
 * empty" — so it is worth surfacing verbatim rather than replacing it with a
 * status code.
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    // The editor's login is a session cookie, and the game's own fetches are
    // credential-less, so it has to be asked for explicitly here.
    credentials: 'same-origin',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(body?.detail ?? `Request failed (${response.status})`, response.status)
  }
  return body as T
}

export const api = {
  session: () => request<SessionState>('/session/'),

  signIn: (username: string, password: string) =>
    request<SessionState>('/session/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  signOut: () => request<void>('/session/', { method: 'DELETE' }),

  list: () => request<{ question_count: number; questions: ListEntry[] }>('/index/'),

  tree: () => request<{ tree: TreeNode[]; facets: Facets }>('/tree/'),

  reload: () => request<{ question_count: number }>('/reload/', { method: 'POST' }),

  bundle: (id: string) => request<Bundle>(`/questions/${encodeURIComponent(id)}/`),

  saveQuestion: (id: string, language: string, body: QuestionBody) =>
    request<QuestionBody>(`/questions/${encodeURIComponent(id)}/${language}/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  saveMeta: (id: string, patch: MetaPatch) =>
    request<QuestionMeta>(`/questions/${encodeURIComponent(id)}/meta/`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  review: (id: string, reviewed: boolean) =>
    request<Record<string, unknown>>(`/questions/${encodeURIComponent(id)}/review/`, {
      method: 'PUT',
      body: JSON.stringify({ reviewed }),
    }),

  categories: () => request<{ categories: GenCategory[] }>('/categories/'),

  generationStatus: () =>
    request<{ capability: Capability; run: RunSummary | null }>('/generate/'),

  startRun: (params: RunRequest) =>
    request<RunSummary>('/generate/', { method: 'POST', body: JSON.stringify(params) }),

  stopRun: () => request<{ stopped: boolean }>('/generate/', { method: 'DELETE' }),

  /** Where the EventSource for a run's progress should point. */
  eventsUrl: () => `${BASE}/generate/events/`,

  /** Where an <audio> element should point for one clip. */
  audioUrl: (id: string, name: string) =>
    `${BASE}/questions/${encodeURIComponent(id)}/audio/${encodeURIComponent(name)}`,
}

/**
 * A detached copy of corpus data.
 *
 * `structuredClone` throws on Vue's reactive proxies — the same trap
 * `snapshotSession()` exists for in `stores/persistence.ts` — and everything
 * here comes out of a store, so it is always a proxy by the time it is cloned.
 * A JSON round-trip is exact for this data: the corpus is JSON on disk.
 */
export function detach<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
