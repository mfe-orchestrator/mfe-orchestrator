import { Schema } from "mongoose"
import { describe, expect, it } from "vitest"
import Microfrontend, { CanaryType } from "./MicrofrontendModel"

const canaryTypePath = () => (Microfrontend.schema.path("canary") as unknown as { schema: Schema }).schema.path("type")

describe("canary type", () => {
    it("stores exactly the three strategies", () => {
        expect(Object.values(CanaryType)).toEqual(["RANDOM", "ON_SESSION", "ON_USER"])
    })

    /**
     * The values written by the previous model — ON_SESSIONS and COOKIE_BASED — are rewritten to
     * ON_SESSION by migrateLegacyCanaryTypes at boot, so nothing may accept them any more: leaving one
     * in the enum would let a document keep a value no strategy answers to, and that microfrontend
     * would quietly serve the stable version to everybody.
     */
    it("no longer accepts the values written by the previous model", () => {
        expect(canaryTypePath().options.enum).toEqual([CanaryType.RANDOM, CanaryType.ON_SESSION, CanaryType.ON_USER])
    })

    it("defaults to the sticky strategy", () => {
        expect(canaryTypePath().options.default).toBe(CanaryType.ON_SESSION)
    })
})
