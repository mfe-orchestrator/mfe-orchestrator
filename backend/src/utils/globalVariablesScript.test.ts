import { describe, expect, it } from "vitest"
import { globalVariablesScriptUrl, injectGlobalVariablesScript } from "./globalVariablesScript"

const URL = "https://console.mfe-orchestrator.dev/api/serve/global-variables/auto/6936fe9cb862bc56f28342e8/index.js"
const TAG = `<script src="${URL}"></script>`

const document = (head: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />${head}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

describe("globalVariablesScriptUrl", () => {
    it("Given a backend url and a project id, when the url is built, then it addresses the project through the auto form", () => {
        expect(globalVariablesScriptUrl("https://console.mfe-orchestrator.dev/api", "6936fe9cb862bc56f28342e8")).toBe(URL)
    })

    it("Given a backend url with a trailing slash, when the url is built, then the path is not doubled", () => {
        expect(globalVariablesScriptUrl("https://console.mfe-orchestrator.dev/api/", "6936fe9cb862bc56f28342e8")).toBe(URL)
    })
})

describe("injectGlobalVariablesScript", () => {
    it("Given a document without the tag, when it is injected, then it lands at the end of the head", () => {
        const result = injectGlobalVariablesScript(document(""), URL)

        expect(result).toBe(document(`\n    ${TAG}`))
    })

    it("Given a document already carrying exactly the tag, when it is injected, then there is nothing to change", () => {
        expect(injectGlobalVariablesScript(document(`\n    ${TAG}`), URL)).toBeNull()
    })

    it("Given a tag addressing one environment, when it is injected, then that tag becomes the portable one instead of a second being added", () => {
        const environmentSpecific = `<script src="https://console.mfe-orchestrator.dev/api/serve/global-variables/6a71f61943857c3da9eb0364/index.js"></script>`

        const result = injectGlobalVariablesScript(document(`\n    ${environmentSpecific}`), URL)

        expect(result).toBe(document(`\n    ${TAG}`))
    })

    it("Given a document with no head, when it is injected, then the tag goes in ahead of the bundle at the top of the body", () => {
        const html = `<html><body><div id="root"></div><script src="/main.js"></script></body></html>`

        expect(injectGlobalVariablesScript(html, URL)).toBe(`<html><body>\n    ${TAG}<div id="root"></div><script src="/main.js"></script></body></html>`)
    })

    it("Given a file that is not a document, when it is injected, then nothing is guessed", () => {
        expect(injectGlobalVariablesScript("<div>a fragment</div>", URL)).toBeNull()
    })
})
