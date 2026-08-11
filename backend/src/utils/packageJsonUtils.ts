export interface PackageManifest {
    name?: string
    version?: string
    [section: string]: unknown
}

/**
 * Serialises a manifest back with the indentation of the file it came from, so a one dependency
 * change does not show up as a reformat of the whole package.json.
 */
export const serializePackageJson = (raw: string, manifest: PackageManifest): string => {
    const indentMatch = /\n([ \t]+)"/.exec(raw)
    const indent = indentMatch ? indentMatch[1] : "  "
    const trailingNewline = raw.endsWith("\n") ? "\n" : ""

    return `${JSON.stringify(manifest, null, indent)}${trailingNewline}`
}

/** Whether a package is declared in any of the dependency sections of a manifest */
export const isDependencyDeclared = (manifest: PackageManifest, packageName: string): boolean =>
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some(section => {
        const values = manifest[section]
        return Boolean(values && typeof values === "object" && packageName in (values as Record<string, string>))
    })
