import { describe, expect, it } from "vitest"
import { runConnectionTest, withTimeout } from "./connectionTest"

describe("runConnectionTest", () => {
    it("given a test that passes, when it runs, then the answer is ok", async () => {
        expect(await runConnectionTest(async () => undefined, [])).toEqual({ ok: true })
    })

    it("given a test that fails, when it runs, then the answer carries what the client said", async () => {
        expect(await runConnectionTest(() => Promise.reject(new Error("The AWS Access Key Id you provided does not exist in our records.")), [])).toEqual({
            ok: false,
            message: "The AWS Access Key Id you provided does not exist in our records."
        })
    })

    it("given a client that quotes the credentials, when the test fails, then they are blanked out", async () => {
        const result = await runConnectionTest(() => Promise.reject(new Error("Invalid connection string AccountKey=s3cret;AccountName=ours")), ["AccountKey=s3cret;AccountName=ours", "s3cret"])

        expect(result.message).not.toContain("s3cret")
    })

    /** Node reports a refused connection to a host with several addresses this way, with an empty message */
    it("given an AggregateError, when the test fails, then the first cause is the message", async () => {
        const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:9000"), { code: "ECONNREFUSED" })

        expect((await runConnectionTest(() => Promise.reject(new AggregateError([refused], "")), [])).message).toBe("connect ECONNREFUSED 10.0.0.1:9000")
    })
})

describe("runConnectionTest, nested causes", () => {
    it("given a failure whose reason is in its cause, when the test fails, then the cause is the message", async () => {
        const fetchFailed = new Error("", { cause: new Error("getaddrinfo ENOTFOUND ours.blob.core.windows.net") })

        expect((await runConnectionTest(() => Promise.reject(fetchFailed), [])).message).toBe("getaddrinfo ENOTFOUND ours.blob.core.windows.net")
    })

    it("given a client that quotes the credential URL-encoded, when the test fails, then it is blanked out too", async () => {
        const result = await runConnectionTest(() => Promise.reject(new Error("bad auth in https://minio:p%40ss@storage.local/bucket")), ["p@ss"])

        expect(result.message).toBe("bad auth in https://minio:•••@storage.local/bucket")
    })
})

describe("withTimeout", () => {
    it("given a promise that never settles, when the time is up, then it is rejected", async () => {
        await expect(withTimeout(new Promise(() => undefined), 10, "The test")).rejects.toThrow("The test timed out")
    })
})
