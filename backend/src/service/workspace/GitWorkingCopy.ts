import fs from "node:fs"
import path from "node:path"
import * as git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import { resolveInsideWorkingCopy } from "../../utils/workspacePaths"

export interface GitCredentials {
    username: string
    password: string
}

export type FileChangeAction = "create" | "update" | "delete"

export interface WorkingCopyChange {
    path: string
    action: FileChangeAction
    /** Blob the file had at HEAD: what apply checks the remote still has before overwriting it. */
    baseBlobOid?: string
}

export interface GitAuthor {
    name: string
    email: string
}

export class BranchNotFoundError extends Error {}

export const ORCHESTRATOR_COMMITTER: GitAuthor = { name: "MFE Orchestrator", email: "noreply@mfe-orchestrator.dev" }

/** The remote turned a push down: not a fast-forward, a protected branch, a token without write access. */
export const isPushRefused = (error: unknown) =>
    error instanceof git.Errors.PushRejectedError || error instanceof git.Errors.GitPushError || (error instanceof git.Errors.HttpError && error.data.statusCode === 403)

const textDecoder = new TextDecoder("utf-8", { fatal: false })

/**
 * Passed to every network call. Left undefined, isomorphic-git reads `http.corsProxy` from
 * `.git/config` and sends the credentials to that host: whatever ends up in that file must never
 * decide where the token goes.
 */
const NO_PROXY = ""

/**
 * One cloned repository on disk, driven with isomorphic-git.
 *
 * The remote URL never carries the token: credentials are handed to each network call through
 * `onAuth`, so nothing secret is ever written to `.git/config`. isomorphic-git runs no hooks, so
 * cloning and reading a repository executes none of its code.
 */
export class GitWorkingCopy {
    constructor(
        readonly dir: string,
        private readonly url: string,
        private readonly credentials: GitCredentials
    ) {}

    private get onAuth() {
        return () => this.credentials
    }

    private async isRepository(): Promise<boolean> {
        try {
            await fs.promises.access(path.join(this.dir, ".git"))
            return true
        } catch {
            return false
        }
    }

    /**
     * Brings the working copy to `origin/<branch>` exactly: cloned when missing, fetched and
     * reset when already there, with whatever an earlier run left behind thrown away.
     * Returns the commit it now sits on.
     */
    async prepare(branch: string): Promise<string> {
        if (await this.isRepository()) {
            try {
                return await this.update(branch)
            } catch (error) {
                // A missing branch is the caller's problem; anything else means a broken copy: start over.
                if (error instanceof BranchNotFoundError) throw error
                await fs.promises.rm(this.dir, { recursive: true, force: true })
            }
        }
        await fs.promises.rm(this.dir, { recursive: true, force: true })
        await fs.promises.mkdir(this.dir, { recursive: true })
        await git.clone({ fs, http, dir: this.dir, url: this.url, ref: branch, singleBranch: true, depth: 1, onAuth: this.onAuth, headers: { "User-Agent": "mfe-orchestrator" }, corsProxy: NO_PROXY })
        return git.resolveRef({ fs, dir: this.dir, ref: "HEAD" })
    }

    private async update(branch: string): Promise<string> {
        // The URL is set again on every run: a repository moved or renamed at the provider keeps working.
        await git.setConfig({ fs, dir: this.dir, path: "remote.origin.url", value: this.url })
        const { fetchHead } = await git.fetch({
            fs,
            http,
            dir: this.dir,
            remote: "origin",
            ref: branch,
            singleBranch: true,
            depth: 1,
            onAuth: this.onAuth,
            headers: { "User-Agent": "mfe-orchestrator" },
            corsProxy: NO_PROXY
        })
        if (!fetchHead) {
            throw new BranchNotFoundError(`Branch "${branch}" not found on the remote`)
        }
        await git.writeRef({ fs, dir: this.dir, ref: `refs/heads/${branch}`, value: fetchHead, force: true })
        await git.checkout({ fs, dir: this.dir, ref: branch, force: true })
        await this.discardChanges()
        return fetchHead
    }

    /**
     * Back on the base branch, clean. When that fails the copy is in a state nobody should build on,
     * so it is deleted: it is a cache, the next run clones it again.
     */
    private async restoreOrDrop(baseBranch: string | void, branch: string) {
        try {
            if (baseBranch) await git.checkout({ fs, dir: this.dir, ref: baseBranch, force: true })
            await this.discardChanges()
            await git.deleteBranch({ fs, dir: this.dir, ref: branch })
        } catch {
            await fs.promises.rm(this.dir, { recursive: true, force: true })
        }
    }

    /** Throws away every change of the working tree: untracked files deleted, tracked ones restored from HEAD. */
    async discardChanges(): Promise<void> {
        const matrix = await git.statusMatrix({ fs, dir: this.dir })
        const toRestore: string[] = []
        for (const [filepath, head, workdir, stage] of matrix) {
            if (head === 1 && workdir === 1 && stage === 1) continue
            if (head === 0) {
                await fs.promises.rm(path.join(this.dir, filepath), { force: true })
                if (stage !== 0) await git.remove({ fs, dir: this.dir, filepath })
            } else {
                toRestore.push(filepath)
            }
        }
        if (toRestore.length > 0) {
            await git.checkout({ fs, dir: this.dir, ref: "HEAD", force: true, filepaths: toRestore })
            for (const filepath of toRestore) await git.resetIndex({ fs, dir: this.dir, filepath })
        }
    }

    /** True when .gitignore excludes the path: a file written there would never reach the proposal. */
    async isIgnored(filepath: string): Promise<boolean> {
        return git.isIgnored({ fs, dir: this.dir, filepath })
    }

    /** Files tracked at HEAD, the ones an agent can open. */
    async listFiles(): Promise<string[]> {
        return git.listFiles({ fs, dir: this.dir, ref: "HEAD" })
    }

    /** What changed in the working tree against HEAD. Files ignored by .gitignore are left out. */
    async changes(): Promise<WorkingCopyChange[]> {
        const head = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" })
        const matrix = await git.statusMatrix({ fs, dir: this.dir })
        const changes: WorkingCopyChange[] = []
        for (const [filepath, headStatus, workdir] of matrix) {
            if (headStatus === 0 && workdir === 2) {
                changes.push({ path: filepath, action: "create" })
            } else if (headStatus === 1 && workdir === 0) {
                changes.push({ path: filepath, action: "delete", baseBlobOid: await this.blobOid(head, filepath) })
            } else if (headStatus === 1 && workdir === 2) {
                changes.push({ path: filepath, action: "update", baseBlobOid: await this.blobOid(head, filepath) })
            }
        }
        // statusMatrix reports a file whose content went back to HEAD as modified when only its stat changed.
        const real: WorkingCopyChange[] = []
        for (const change of changes) {
            if (change.action === "update" && (await this.readWorkingFile(change.path)) === (await this.readHeadFile(change.path))) continue
            real.push(change)
        }
        return real
    }

    /** Blob id of a file at a commit, undefined when it is not there. */
    async blobOid(commit: string, filepath: string): Promise<string | undefined> {
        try {
            const { oid } = await git.readBlob({ fs, dir: this.dir, oid: commit, filepath })
            return oid
        } catch {
            return undefined
        }
    }

    /** True when the commit is in the copy. A shallow fetch only brings the tip: older commits are often missing. */
    async hasCommit(oid: string): Promise<boolean> {
        try {
            await git.readCommit({ fs, dir: this.dir, oid })
            return true
        } catch {
            return false
        }
    }

    async readHeadFile(filepath: string): Promise<string | undefined> {
        try {
            const head = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" })
            const { blob } = await git.readBlob({ fs, dir: this.dir, oid: head, filepath })
            return textDecoder.decode(blob)
        } catch {
            return undefined
        }
    }

    async readWorkingFile(filepath: string): Promise<string | undefined> {
        try {
            return await fs.promises.readFile(path.join(this.dir, filepath), "utf8")
        } catch {
            return undefined
        }
    }

    /**
     * Commits `files` on a new branch started from the current HEAD and pushes it, or, with `pushTo`,
     * pushes that commit onto the remote branch `pushTo` instead. The working copy is left on the base
     * branch, clean, whatever happens.
     */
    async commitAndPush({
        branch,
        pushTo,
        message,
        author,
        files
    }: {
        branch: string
        /** A remote branch someone else may push to too (the base): never forced, refused when it moved on. */
        pushTo?: string
        message: string
        author: GitAuthor
        files: { path: string; content?: string; action: FileChangeAction }[]
    }): Promise<string> {
        const baseBranch = await git.currentBranch({ fs, dir: this.dir })
        await git.branch({ fs, dir: this.dir, ref: branch, checkout: true, force: true })
        try {
            for (const file of files) {
                // The copy was just reset to a newer base: a folder may have become a symlink since
                // the proposal, and writing through it would land outside the repository.
                const { absolute, relative } = await resolveInsideWorkingCopy(this.dir, file.path)
                if (relative !== file.path) {
                    throw new Error(`"${file.path}" now resolves to "${relative}" on the base branch`)
                }
                const existing = await fs.promises.lstat(absolute).catch(() => undefined)
                if (existing && !existing.isFile()) {
                    throw new Error(`"${file.path}" is not a regular file on the base branch`)
                }
                if (file.action === "delete") {
                    await fs.promises.rm(absolute, { force: true })
                    await git.remove({ fs, dir: this.dir, filepath: file.path })
                } else {
                    await fs.promises.mkdir(path.dirname(absolute), { recursive: true })
                    await fs.promises.writeFile(absolute, file.content ?? "", "utf8")
                    await git.add({ fs, dir: this.dir, filepath: file.path })
                }
            }
            const commit = await git.commit({ fs, dir: this.dir, message, author, committer: ORCHESTRATOR_COMMITTER })
            // Forced on a branch the orchestrator named: a follow-up replaces the proposal, a retry after a crash reuses it.
            await git.push({
                fs,
                http,
                dir: this.dir,
                remote: "origin",
                ref: branch,
                // A full ref: a bare name is matched against the remote's tags before its branches.
                remoteRef: pushTo && `refs/heads/${pushTo}`,
                force: !pushTo,
                onAuth: this.onAuth,
                headers: { "User-Agent": "mfe-orchestrator" },
                corsProxy: NO_PROXY
            })
            return commit
        } finally {
            await this.restoreOrDrop(baseBranch, branch)
        }
    }

    /** True when the remote has `branch`: asked of the remote, the copy may hold none of its branches */
    async hasRemoteBranch(branch: string): Promise<boolean> {
        const ref = `refs/heads/${branch}`
        const refs = await git.listServerRefs({ http, url: this.url, prefix: ref, onAuth: this.onAuth, headers: { "User-Agent": "mfe-orchestrator" }, corsProxy: NO_PROXY })
        return refs.some(candidate => candidate.ref === ref)
    }

    /**
     * Makes the first commit of an empty repository, with `files`, and pushes it as `branch`: a repository
     * just created at the provider has no branch to clone until then. Not for a repository that has commits.
     */
    async initialize({ branch, message, author, files }: { branch: string; message: string; author: GitAuthor; files: { path: string; content: string }[] }): Promise<string> {
        await fs.promises.rm(this.dir, { recursive: true, force: true })
        await fs.promises.mkdir(this.dir, { recursive: true })
        await git.init({ fs, dir: this.dir, defaultBranch: branch })
        for (const file of files) {
            // A fresh folder with nothing in it: no symlink to resolve, unlike commitAndPush
            await fs.promises.mkdir(path.dirname(path.join(this.dir, file.path)), { recursive: true })
            await fs.promises.writeFile(path.join(this.dir, file.path), file.content, "utf8")
            await git.add({ fs, dir: this.dir, filepath: file.path })
        }
        const commit = await git.commit({ fs, dir: this.dir, message, author, committer: ORCHESTRATOR_COMMITTER })
        await git.addRemote({ fs, dir: this.dir, remote: "origin", url: this.url })
        // Never forced: a repository that already has the branch refuses it
        await git.push({
            fs,
            http,
            dir: this.dir,
            remote: "origin",
            ref: branch,
            remoteRef: `refs/heads/${branch}`,
            onAuth: this.onAuth,
            headers: { "User-Agent": "mfe-orchestrator" },
            corsProxy: NO_PROXY
        })
        return commit
    }

    /** Pushes a commit already in the copy onto the remote `branch`. Never forced: refused unless it is a fast-forward. */
    async pushCommit(commit: string, branch: string): Promise<void> {
        const ref = "refs/heads/mfe-orchestrator-push"
        await git.writeRef({ fs, dir: this.dir, ref, value: commit, force: true })
        try {
            await git.push({
                fs,
                http,
                dir: this.dir,
                remote: "origin",
                ref,
                remoteRef: `refs/heads/${branch}`,
                onAuth: this.onAuth,
                headers: { "User-Agent": "mfe-orchestrator" },
                corsProxy: NO_PROXY
            })
        } finally {
            await git.deleteRef({ fs, dir: this.dir, ref }).catch(() => undefined)
        }
    }

    /** Deletes `branch` on the remote. */
    async deleteRemoteBranch(branch: string): Promise<void> {
        // isomorphic-git resolves `ref` locally even to delete: HEAD is always there, `remoteRef` says what goes.
        await git.push({
            fs,
            http,
            dir: this.dir,
            remote: "origin",
            ref: "HEAD",
            remoteRef: `refs/heads/${branch}`,
            delete: true,
            onAuth: this.onAuth,
            headers: { "User-Agent": "mfe-orchestrator" },
            corsProxy: NO_PROXY
        })
    }

    /** Size on disk in bytes, `.git` included. */
    async sizeInBytes(): Promise<number> {
        const walk = async (dir: string): Promise<number> => {
            let total = 0
            for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                if (entry.isDirectory()) total += await walk(full)
                else if (entry.isFile()) total += (await fs.promises.stat(full)).size
            }
            return total
        }
        return walk(this.dir)
    }
}
