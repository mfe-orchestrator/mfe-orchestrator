/**
 * Builds the documentation index the console assistant searches.
 *
 * The documentation lives in its own repository, next to this one, and is not
 * shipped with the backend image: the index is generated here and committed, so
 * the assistant can answer from the docs without network access to the site.
 *
 * Usage: node scripts/build-docs-index.js [path/to/documentation/docs]
 */
// biome-ignore lint/style/noCommonJs: plain Node script run without a build step, like postbuild.js
const fs = require("fs")
// biome-ignore lint/style/noCommonJs: plain Node script run without a build step, like postbuild.js
const path = require("path")

const DOCS_DIR = path.resolve(process.argv[2] || path.join(__dirname, "../../../documentation/docs"))
const OUTPUT = path.join(__dirname, "../src/service/assistant/docs-index.json")
const DOCS_BASE_URL = "https://mfe-orchestrator.dev/documentation/docs"

const listMarkdownFiles = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) return listMarkdownFiles(fullPath)
        return /\.mdx?$/.test(entry.name) ? [fullPath] : []
    })

const splitFrontmatter = source => {
    const match = source.match(/^---\n([\s\S]*?)\n---\n?/)
    if (!match) return { frontmatter: {}, body: source }
    const frontmatter = {}
    for (const line of match[1].split("\n")) {
        const separator = line.indexOf(":")
        if (separator > 0)
            frontmatter[line.slice(0, separator).trim()] = line
                .slice(separator + 1)
                .trim()
                .replace(/^["']|["']$/g, "")
    }
    return { frontmatter, body: source.slice(match[0].length) }
}

/** Drops what only makes sense to the MDX renderer: imports and JSX tags. */
const cleanBody = body =>
    body
        .replace(/^import .*$/gm, "")
        .replace(/<\/?[A-Z][^>]*>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

const toUrl = (relativePath, frontmatter) => {
    if (frontmatter.slug) return `${DOCS_BASE_URL}/${frontmatter.slug.replace(/^\//, "")}`
    const withoutExtension = relativePath.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "")
    return `${DOCS_BASE_URL}/${withoutExtension}`
}

const anchorOf = heading =>
    heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-")

/** One entry per `##` section, so a search hit points at the part of the page that answers. */
const toSections = (file, source) => {
    const relativePath = path.relative(DOCS_DIR, file).split(path.sep).join("/")
    const { frontmatter, body } = splitFrontmatter(source)
    const pageUrl = toUrl(relativePath, frontmatter)
    const cleaned = cleanBody(body)
    const pageTitle = frontmatter.title || cleaned.match(/^# (.+)$/m)?.[1] || relativePath

    const sections = []
    let current = { heading: undefined, lines: [] }
    for (const line of cleaned.split("\n")) {
        const heading = line.match(/^## (.+)$/)
        if (heading) {
            sections.push(current)
            current = { heading: heading[1].trim(), lines: [] }
        } else {
            current.lines.push(line)
        }
    }
    sections.push(current)

    return sections
        .map(section => ({
            title: section.heading ? `${pageTitle} — ${section.heading}` : pageTitle,
            url: section.heading ? `${pageUrl}#${anchorOf(section.heading)}` : pageUrl,
            text: section.lines
                .join("\n")
                .replace(/^# .+$/m, "")
                .trim()
        }))
        .filter(section => section.text.length > 0)
}

const index = listMarkdownFiles(DOCS_DIR)
    .sort()
    .flatMap(file => toSections(file, fs.readFileSync(file, "utf8")))

fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 1) + "\n")
console.log(`Indexed ${index.length} sections from ${DOCS_DIR} into ${OUTPUT}`)
