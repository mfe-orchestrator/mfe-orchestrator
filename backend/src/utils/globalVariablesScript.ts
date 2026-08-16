/**
 * The `<script>` tag that gives a host its runtime configuration.
 *
 * The console serves the global variables of an environment as executable JavaScript assigning
 * `window.globalConfig`, and a plain `<script src>` in the document head is what makes them
 * readable synchronously, before the first line of the application runs. That is the difference
 * from the values written into the bundler config: those are baked in at build time and need a
 * rebuild to change, these are fetched on every page load and change from the console alone.
 *
 * The url is always the `auto` form, addressed by project rather than by environment, so the very
 * same `index.html` works in every environment: the backend resolves which one answers from the
 * domain the page is served on. Naming an environment here would bake the environment into the
 * artifact and turn a promotion into an edit.
 */

/** Path segment of the endpoint, the one thing every form of the url has in common. */
const ENDPOINT = "/serve/global-variables/"

/**
 * Any script tag already pointing at that endpoint, whichever form it addresses the environment
 * with. The environment specific form is what the integration screen used to hand out, so this is
 * what turns an existing tag into the portable one instead of adding a second.
 */
const EXISTING_TAG = /<script\b[^>]*\bsrc=["'][^"']*\/serve\/global-variables\/[^"']*["'][^>]*>\s*<\/script>/i

/** Captured indentation so the tag lands at the indentation the document is already written in. */
const HEAD_CLOSE = /([ \t]*)<\/head>/i
const BODY_OPEN = /<body\b[^>]*>/i

export const globalVariablesScriptUrl = (backendUrl: string, projectId: string): string => `${backendUrl.replace(/\/+$/, "")}${ENDPOINT}auto/${projectId}/index.js`

export const globalVariablesScriptTag = (url: string): string => `<script src="${url}"></script>`

/**
 * The document with the tag in it, or null when there is nothing to do: either it is already
 * exactly there, or the file has no place to put it that would run before the application.
 *
 * The end of `<head>` is that place. A classic script executes while the document is being parsed,
 * whereas the module script a bundler emits for the application is deferred until parsing is over,
 * so `window.globalConfig` is always populated by the time anything reads it, wherever the bundler
 * chose to inject its own tags.
 */
export const injectGlobalVariablesScript = (html: string, url: string): string | null => {
    const tag = globalVariablesScriptTag(url)
    const existing = html.match(EXISTING_TAG)

    if (existing) {
        return existing[0] === tag ? null : html.replace(EXISTING_TAG, tag)
    }

    const head = html.match(HEAD_CLOSE)
    if (head) {
        const indent = head[1]
        return html.replace(HEAD_CLOSE, `${indent}  ${tag}\n${indent}</head>`)
    }

    // No head to speak of: right after the opening body tag is still ahead of the bundle, which
    // every generator puts at the end of the body.
    const body = html.match(BODY_OPEN)
    if (body) {
        return html.replace(BODY_OPEN, `${body[0]}\n    ${tag}`)
    }

    return null
}
