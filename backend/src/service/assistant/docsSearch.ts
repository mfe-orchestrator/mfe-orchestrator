import docsIndex from "./docs-index.json"

export interface DocsSection {
    title: string
    url: string
    text: string
}

const sections: DocsSection[] = docsIndex

const tokenize = (value: string): string[] =>
    value
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(token => token.length > 1)

interface IndexedSection {
    section: DocsSection
    termFrequencies: Map<string, number>
    titleTerms: Set<string>
    length: number
}

const indexed: IndexedSection[] = sections.map(section => {
    const terms = tokenize(section.text)
    const termFrequencies = new Map<string, number>()
    for (const term of terms) termFrequencies.set(term, (termFrequencies.get(term) || 0) + 1)
    return { section, termFrequencies, titleTerms: new Set(tokenize(section.title)), length: terms.length }
})

const averageLength = indexed.reduce((sum, entry) => sum + entry.length, 0) / Math.max(indexed.length, 1)

const documentFrequency = new Map<string, number>()
for (const entry of indexed) {
    for (const term of new Set([...entry.termFrequencies.keys(), ...entry.titleTerms])) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
    }
}

const BM25_K1 = 1.2
const BM25_B = 0.75
/** A term in the heading says more about what the section is for than one more mention in its body. */
const TITLE_BOOST = 2

/**
 * Plain BM25 over the documentation sections.
 *
 * The docs are a few hundred sections in English and the questions name product concepts
 * (canary, bucket, environment), so keyword matching finds the right page without the cost
 * of an embedding store; the model rephrases and searches again when the first try misses.
 */
export const searchDocs = (query: string, limit = 5): DocsSection[] => {
    const queryTerms = [...new Set(tokenize(query))]
    if (queryTerms.length === 0) return []

    const scored = indexed.map(entry => {
        let score = 0
        for (const term of queryTerms) {
            const frequency = entry.termFrequencies.get(term) || 0
            const inTitle = entry.titleTerms.has(term)
            if (!frequency && !inTitle) continue
            const df = documentFrequency.get(term) || 0
            const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5))
            const tf = (frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * (1 - BM25_B + (BM25_B * entry.length) / averageLength))
            score += idf * (tf + (inTitle ? TITLE_BOOST : 0))
        }
        return { section: entry.section, score }
    })

    return scored
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(result => result.section)
}
