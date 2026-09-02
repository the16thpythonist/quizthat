import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QuestionMeta, QuestionData } from '../types/session'

export const useCorpusStore = defineStore('corpus', () => {
  const questions = ref<QuestionMeta[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const corpusBaseUrl = computed(() => '/corpus/')

  async function loadCorpus(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const url = `${corpusBaseUrl.value}corpus-index.json`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch corpus index: ${response.status}`)
      const data = await response.json()
      questions.value = data.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        languages: q.languages,
        major_category: q.major_category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        question_type: q.question_type,
        time_limit_seconds: q.time_limit_seconds,
        version: 1,
        created_at: '',
        generation_batch: null,
      }))
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchTeaserTitle(questionId: string, language: string): Promise<string> {
    try {
      const url = `${corpusBaseUrl.value}${questionId}/question.${language}.json`
      const response = await fetch(url)
      if (!response.ok) return ''
      const data = await response.json()
      return data.teaser_title ?? ''
    } catch {
      return ''
    }
  }

  /**
   * The expertise taxonomy, derived from the questions actually present.
   *
   * Built from the corpus rather than a fixed list so every option offered at
   * setup has questions behind it, and so it grows on its own as the corpus
   * does. The engine matches expertise against these exact strings.
   */
  const categories = computed(() => {
    const byMajor = new Map<string, Set<string>>()
    for (const q of questions.value) {
      if (!q.major_category) continue
      if (!byMajor.has(q.major_category)) byMajor.set(q.major_category, new Set())
      if (q.subcategory) byMajor.get(q.major_category)!.add(q.subcategory)
    }
    return [...byMajor.entries()]
      .map(([major, subs]) => ({
        major,
        subcategories: [...subs].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.major.localeCompare(b.major))
  })

  async function fetchQuestionData(questionId: string, language: string): Promise<QuestionData | null> {
    try {
      const url = `${corpusBaseUrl.value}${questionId}/question.${language}.json`
      const response = await fetch(url)
      if (!response.ok) return null
      const data = await response.json()
      const meta = questions.value.find((q) => q.id === questionId)
      return {
        teaser_title: data.teaser_title ?? '',
        question_text: data.question_text ?? '',
        hint: data.hint ?? null,
        answer_data: data.answer_data,
        question_type: meta?.question_type ?? 'multiple_choice',
      }
    } catch {
      return null
    }
  }

  return { questions, loading, error, loaded, corpusBaseUrl, categories, loadCorpus, fetchTeaserTitle, fetchQuestionData }
})
