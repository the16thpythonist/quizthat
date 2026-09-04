import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAdminStore } from '../store'
import type { ListEntry } from '../api'

/**
 * Narrowing the corpus happens in the browser, not on the server — that is what
 * makes clicking a category in the tree instant. These pin down the filter, and
 * in particular that the filters compose rather than override each other.
 */

function entry(overrides: Partial<ListEntry> = {}): ListEntry {
  return {
    id: 'aaaa1111',
    major_category: 'Geography',
    subcategory: 'Mountains',
    difficulty: 'medium',
    question_type: 'map_location',
    languages: ['de', 'en'],
    present_languages: ['de', 'en'],
    time_limit_seconds: null,
    has_audio: true,
    reviewed: true,
    titles: { de: 'Auf dem Dach der Welt', en: 'On top of the world' },
    ...overrides,
  }
}

describe('the editor filter', () => {
  let admin: ReturnType<typeof useAdminStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    admin = useAdminStore()
    admin.entries = [
      entry(),
      entry({ id: 'bbbb2222', subcategory: 'Rivers', titles: { de: 'Der lange Fluss' } }),
      entry({
        id: 'cccc3333',
        major_category: 'History',
        subcategory: 'Rome',
        difficulty: 'hard',
        question_type: 'multiple_choice',
        titles: { de: 'Alle Wege' },
      }),
    ]
  })

  it('shows everything until something is selected', () => {
    expect(admin.filtered).toHaveLength(3)
  })

  it('narrows to a major category', () => {
    admin.selectCategory('Geography')
    expect(admin.filtered.map((e) => e.id)).toEqual(['aaaa1111', 'bbbb2222'])
  })

  it('narrows further to a subcategory', () => {
    admin.selectCategory('Geography', 'Rivers')
    expect(admin.filtered.map((e) => e.id)).toEqual(['bbbb2222'])
  })

  it('searches the teaser titles, not only the ids', () => {
    admin.search = 'dach der welt'
    expect(admin.filtered.map((e) => e.id)).toEqual(['aaaa1111'])
  })

  it('searches every language, whichever one is on screen', () => {
    admin.language = 'de'
    admin.search = 'top of the world'
    expect(admin.filtered.map((e) => e.id)).toEqual(['aaaa1111'])
  })

  it('combines the tree selection with the other filters', () => {
    admin.selectCategory('Geography')
    admin.difficulty = 'hard'
    // The hard question is in History, so the category wins over the difficulty
    // rather than the two being applied as alternatives.
    expect(admin.filtered).toHaveLength(0)
  })

  it('filters by question type', () => {
    admin.questionType = 'multiple_choice'
    expect(admin.filtered.map((e) => e.id)).toEqual(['cccc3333'])
  })

  it('survives an entry with no titles at all', () => {
    admin.entries = [entry({ titles: undefined as unknown as Record<string, string> })]
    admin.search = 'anything'
    expect(admin.filtered).toHaveLength(0)
  })
})
