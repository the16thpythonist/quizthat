/**
 * The editor's state: what is signed in, what is selected, and what is unsaved.
 *
 * Filtering happens here rather than on the server. The corpus is a few hundred
 * questions of metadata at most, so it is fetched once and narrowed in memory —
 * which is what lets clicking a category in the tree feel instant instead of
 * being a round trip.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError, type Bundle, type Facets, type ListEntry, type MetaPatch, type QuestionBody, type TreeNode } from './api'

/** Which slice of the corpus the left-hand tree has selected. */
export interface Selection {
  major: string | null
  subcategory: string | null
}

export const useAdminStore = defineStore('admin', () => {
  // -- session ---------------------------------------------------
  const configured = ref(true)
  const signedIn = ref(false)
  const checkingSession = ref(true)

  // -- corpus ----------------------------------------------------
  const entries = ref<ListEntry[]>([])
  const tree = ref<TreeNode[]>([])
  const facets = ref<Facets>({
    major_category: [],
    difficulty: [],
    question_type: [],
    language: [],
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  // -- what is selected ------------------------------------------
  /** Which half of the editor is showing: the corpus, or the generator. */
  const tab = ref<'questions' | 'generate'>('questions')

  const selection = ref<Selection>({ major: null, subcategory: null })
  const search = ref('')
  const difficulty = ref('')
  const questionType = ref('')
  const selectedId = ref<string | null>(null)
  const bundle = ref<Bundle | null>(null)
  const language = ref('de')
  const loadingBundle = ref(false)

  /**
   * The language to open a question in.
   *
   * Sticky across questions — a curator proof-reading the German corpus should
   * not have to re-pick German on every row — but it falls back rather than
   * showing an empty pane when a question has no file in it.
   */
  function preferredLanguage(present: string[]): string {
    if (present.includes(language.value)) return language.value
    return present[0] ?? 'de'
  }

  const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return entries.value.filter((entry) => {
      if (selection.value.major && entry.major_category !== selection.value.major) return false
      if (selection.value.subcategory && entry.subcategory !== selection.value.subcategory) {
        return false
      }
      if (difficulty.value && entry.difficulty !== difficulty.value) return false
      if (questionType.value && entry.question_type !== questionType.value) return false
      if (!needle) return true
      const haystack = [
        entry.id,
        entry.major_category,
        entry.subcategory,
        ...Object.values(entry.titles ?? {}),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  })

  const selectedEntry = computed(() =>
    entries.value.find((entry) => entry.id === selectedId.value) ?? null,
  )

  /** The question file being edited, or null while nothing is open. */
  const body = computed<QuestionBody | null>(() => {
    if (!bundle.value) return null
    return bundle.value.languages[language.value] ?? null
  })

  // -- session actions -------------------------------------------

  async function checkSession(): Promise<void> {
    checkingSession.value = true
    try {
      const state = await api.session()
      configured.value = state.configured
      signedIn.value = state.signed_in
      if (signedIn.value) await loadCorpus()
    } catch (err) {
      error.value = messageFor(err)
    } finally {
      checkingSession.value = false
    }
  }

  async function signIn(username: string, password: string): Promise<void> {
    const state = await api.signIn(username, password)
    signedIn.value = state.signed_in
    await loadCorpus()
  }

  async function signOut(): Promise<void> {
    await api.signOut()
    signedIn.value = false
    entries.value = []
    bundle.value = null
    selectedId.value = null
  }

  // -- corpus actions --------------------------------------------

  async function loadCorpus(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [listing, structure] = await Promise.all([api.list(), api.tree()])
      entries.value = listing.questions
      tree.value = structure.tree
      facets.value = structure.facets
    } catch (err) {
      error.value = messageFor(err)
    } finally {
      loading.value = false
    }
  }

  /** Re-scan the folder on the server, then pull the listing again. */
  async function rescan(): Promise<void> {
    await api.reload()
    await loadCorpus()
    if (selectedId.value) await open(selectedId.value)
  }

  async function open(id: string): Promise<void> {
    selectedId.value = id
    loadingBundle.value = true
    error.value = null
    try {
      const loaded = await api.bundle(id)
      bundle.value = loaded
      language.value = preferredLanguage(loaded.present_languages)
    } catch (err) {
      error.value = messageFor(err)
      bundle.value = null
    } finally {
      loadingBundle.value = false
    }
  }

  function selectCategory(major: string | null, subcategory: string | null = null): void {
    selection.value = { major, subcategory }
  }

  // -- saving ----------------------------------------------------

  async function saveQuestion(edited: QuestionBody): Promise<void> {
    if (!bundle.value) return
    const id = bundle.value.id
    const saved = await api.saveQuestion(id, language.value, edited)
    bundle.value.languages[language.value] = saved
    // The listing shows the teaser title, so it is stale the moment one changes.
    const entry = entries.value.find((e) => e.id === id)
    if (entry) entry.titles = { ...entry.titles, [language.value]: saved.teaser_title }
  }

  /**
   * Mark a question reviewed, or put it back.
   *
   * This is what actually puts a generated question in front of players:
   * `build-corpus-index` leaves unreviewed ones out of the game's index.
   */
  async function setReviewed(reviewed: boolean): Promise<void> {
    if (!bundle.value) return
    const id = bundle.value.id
    const saved = await api.review(id, reviewed)
    bundle.value.meta = saved as unknown as typeof bundle.value.meta
    const entry = entries.value.find((e) => e.id === id)
    if (entry) entry.reviewed = reviewed
  }

  async function saveMeta(patch: MetaPatch): Promise<void> {
    if (!bundle.value) return
    const id = bundle.value.id
    const saved = await api.saveMeta(id, patch)
    bundle.value.meta = saved
    const entry = entries.value.find((e) => e.id === id)
    if (entry) {
      entry.major_category = saved.major_category
      entry.subcategory = saved.subcategory
      entry.difficulty = saved.difficulty
      entry.question_type = saved.question_type
      entry.time_limit_seconds = saved.time_limit_seconds
    }
    // A changed category moves the question in the tree, and the counts beside
    // every node with it.
    const structure = await api.tree()
    tree.value = structure.tree
    facets.value = structure.facets
  }

  return {
    configured,
    signedIn,
    checkingSession,
    entries,
    tree,
    facets,
    loading,
    error,
    tab,
    selection,
    search,
    difficulty,
    questionType,
    selectedId,
    selectedEntry,
    bundle,
    body,
    language,
    loadingBundle,
    filtered,
    checkSession,
    signIn,
    signOut,
    loadCorpus,
    rescan,
    open,
    selectCategory,
    saveQuestion,
    saveMeta,
    setReviewed,
  }
})

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}
