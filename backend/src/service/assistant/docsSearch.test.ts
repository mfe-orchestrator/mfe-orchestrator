import { describe, expect, it } from "vitest"
import { searchDocs } from "./docsSearch"

describe("searchDocs", () => {
    it("Given a query naming a product concept, when searching, then sections about it come first, each with a docs URL", () => {
        const results = searchDocs("canary release")

        expect(results.length).toBeGreaterThan(0)
        expect(`${results[0].title} ${results[0].text}`.toLowerCase()).toContain("canary")
        for (const result of results) {
            expect(result.url).toMatch(/^https:\/\/mfe-orchestrator\.dev\/documentation\/docs\//)
        }
    })

    it("Given a limit, when searching, then no more results than the limit are returned", () => {
        expect(searchDocs("environment", 2)).toHaveLength(2)
    })

    it("Given a query with no usable words, when searching, then nothing is returned", () => {
        expect(searchDocs("?! a")).toEqual([])
    })
})
