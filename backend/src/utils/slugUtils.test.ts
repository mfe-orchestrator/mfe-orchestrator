import { describe, expect, it } from "vitest"
import { slugify } from "./slugUtils"

/**
 * The single rule for the slugs the platform derives from a display name: organizations, and now
 * projects too. It is worth pinning down, because a project slug cannot be corrected after the
 * fact - it is part of the `<slug>-<id>/` path the uploaded bundles live under, so the console
 * shows it read-only and the update route refuses it.
 */
describe("slugify", () => {
    it("given a name with several words, when it is slugified, then every space becomes a hyphen", () => {
        // The hand-rolled version this replaced used `replace` on a literal, which only ever hit
        // the first occurrence: this name was stored as "my-cool storefront app".
        expect(slugify("My Cool Storefront App")).toBe("my-cool-storefront-app")
    })

    it("given consecutive separators, when the name is slugified, then they collapse into one hyphen", () => {
        expect(slugify("Acme  Storefront")).toBe("acme-storefront")
        expect(slugify("v1.2.3_rc_beta")).toBe("v1-2-3-rc-beta")
    })

    it("given characters outside a-z0-9, when the name is slugified, then they become hyphens", () => {
        expect(slugify("Négoce & Cie (2026)")).toBe("n-goce-cie-2026")
        expect(slugify("checkout/flow")).toBe("checkout-flow")
    })

    it("given separators at either end, when the name is slugified, then the slug does not start or end with a hyphen", () => {
        expect(slugify("  Acme  ")).toBe("acme")
        expect(slugify("...Acme...")).toBe("acme")
    })

    it("given a name that is already a slug, when it is slugified, then it comes back unchanged", () => {
        expect(slugify("acme-storefront")).toBe("acme-storefront")
    })

    it("given a name with nothing usable in it, when it is slugified, then the result is empty", () => {
        // The caller decides what to do about it: the schema requires a slug, so an empty one is
        // refused at save time rather than silently stored.
        expect(slugify("???")).toBe("")
    })
})
