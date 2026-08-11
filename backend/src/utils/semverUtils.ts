/**
 * Minimal semver helpers used by the dependency analysis.
 *
 * The backend does not depend on the `semver` package: only the subset needed to
 * compare declared ranges with the versions published on the registry is implemented here.
 */

export interface ParsedVersion {
    major: number
    minor: number
    patch: number
    prerelease?: string
    raw: string
}

export type VersionDelta = "NONE" | "PATCH" | "MINOR" | "MAJOR"

// Ranges pointing to something that is not a registry version (git urls, local links, ...)
const UNSUPPORTED_RANGE = /^(git|git\+|file:|link:|portal:|https?:|ssh:|github:|bitbucket:|gitlab:)/i

// First version-ish token inside a range: 1, 1.2, 1.2.3, 1.x, 1.2.x, 1.2.3-beta.1
const VERSION_TOKEN = /(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?/

const toNumber = (value?: string): number => {
    if (!value || value === "x" || value === "X" || value === "*") {
        return 0
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Removes the prefixes that npm/pnpm/yarn allow in front of a plain range.
 * Returns undefined when the range does not point to a registry version at all.
 */
const normalizeRange = (range?: string | null): string | undefined => {
    if (!range) {
        return undefined
    }

    let value = range.trim()
    if (!value) {
        return undefined
    }

    if (value.startsWith("workspace:")) {
        value = value.slice("workspace:".length).trim()
    }

    if (value.startsWith("npm:")) {
        // npm:@scope/name@^1.2.3 -> ^1.2.3
        const separatorIndex = value.lastIndexOf("@")
        value = separatorIndex > "npm:".length ? value.slice(separatorIndex + 1).trim() : ""
    }

    if (!value || UNSUPPORTED_RANGE.test(value)) {
        return undefined
    }

    return value
}

export const parseVersion = (value?: string | null): ParsedVersion | null => {
    if (!value) {
        return null
    }

    const match = VERSION_TOKEN.exec(value.trim())
    if (!match) {
        return null
    }

    return {
        major: toNumber(match[1]),
        minor: toNumber(match[2]),
        patch: toNumber(match[3]),
        prerelease: match[4],
        raw: match[0]
    }
}

/**
 * Lowest version satisfying the range, which is what a fresh install would pick as a floor.
 * Returns null for wildcards (`*`, `latest`) and for non registry ranges.
 */
export const minVersionOfRange = (range?: string | null): ParsedVersion | null => {
    const normalized = normalizeRange(range)
    if (!normalized) {
        return null
    }
    return parseVersion(normalized)
}

const comparePrerelease = (a?: string, b?: string): number => {
    if (a === b) {
        return 0
    }
    // A version without prerelease is always greater than the same version with one
    if (!a) {
        return 1
    }
    if (!b) {
        return -1
    }

    const left = a.split(".")
    const right = b.split(".")

    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const leftPart = left[index]
        const rightPart = right[index]

        if (leftPart === undefined) {
            return -1
        }
        if (rightPart === undefined) {
            return 1
        }
        if (leftPart === rightPart) {
            continue
        }

        const leftNumeric = /^\d+$/.test(leftPart)
        const rightNumeric = /^\d+$/.test(rightPart)

        if (leftNumeric && rightNumeric) {
            return Number.parseInt(leftPart, 10) - Number.parseInt(rightPart, 10)
        }
        if (leftNumeric) {
            return -1
        }
        if (rightNumeric) {
            return 1
        }
        return leftPart < rightPart ? -1 : 1
    }

    return 0
}

export const compareVersions = (a?: ParsedVersion | null, b?: ParsedVersion | null): number => {
    if (!a && !b) {
        return 0
    }
    if (!a) {
        return -1
    }
    if (!b) {
        return 1
    }

    if (a.major !== b.major) {
        return a.major - b.major
    }
    if (a.minor !== b.minor) {
        return a.minor - b.minor
    }
    if (a.patch !== b.patch) {
        return a.patch - b.patch
    }

    return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * How far `current` is from `latest`. Returns "NONE" when current is aligned (or ahead).
 */
export const diffVersions = (current?: ParsedVersion | null, latest?: ParsedVersion | null): VersionDelta => {
    if (!current || !latest || compareVersions(current, latest) >= 0) {
        return "NONE"
    }

    if (current.major !== latest.major) {
        return "MAJOR"
    }
    if (current.minor !== latest.minor) {
        return "MINOR"
    }
    return "PATCH"
}

/**
 * Picks the range that every microfrontend should converge to: the one with the highest
 * floor version. Ties are broken by the most frequently declared range so that the
 * alignment touches as few repositories as possible.
 */
export const pickHighestRange = (ranges: string[]): string | undefined => {
    if (ranges.length === 0) {
        return undefined
    }

    const occurrences = ranges.reduce<Map<string, number>>((accumulator, range) => {
        accumulator.set(range, (accumulator.get(range) || 0) + 1)
        return accumulator
    }, new Map())

    let winner: string | undefined
    let winnerVersion: ParsedVersion | null = null

    for (const range of occurrences.keys()) {
        const version = minVersionOfRange(range)
        if (!winner) {
            winner = range
            winnerVersion = version
            continue
        }

        const comparison = compareVersions(version, winnerVersion)
        if (comparison > 0 || (comparison === 0 && (occurrences.get(range) || 0) > (occurrences.get(winner) || 0))) {
            winner = range
            winnerVersion = version
        }
    }

    return winner
}
