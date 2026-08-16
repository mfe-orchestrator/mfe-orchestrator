import { describe, expect, it } from "vitest"
import { AzureDevOpsBuild } from "../client/AzureDevOpsClient"
import { GithubWorkflowRun } from "../client/GithubClient"
import { GitLabPipeline } from "../client/GitlabClient"
import { BuildStatus } from "../types/BuildStatusDTO"
import { toAzureRun, toGithubRun, toGitlabRun } from "./BuildStatusService"

const githubRun = (overrides: Partial<GithubWorkflowRun>): GithubWorkflowRun => ({
    id: 1,
    head_sha: "abc123",
    html_url: "https://github.com/acme/web/actions/runs/1",
    created_at: "2026-08-16T10:00:00.000Z",
    updated_at: "2026-08-16T10:05:00.000Z",
    ...overrides
})

const gitlabPipeline = (overrides: Partial<GitLabPipeline>): GitLabPipeline => ({
    id: 7,
    project_id: 42,
    sha: "abc123",
    ref: "1.2.0",
    status: "success",
    web_url: "https://gitlab.com/acme/web/-/pipelines/7",
    created_at: "2026-08-16T10:00:00.000Z",
    updated_at: "2026-08-16T10:05:00.000Z",
    ...overrides
})

const azureBuild = (overrides: Partial<AzureDevOpsBuild>): AzureDevOpsBuild => ({
    id: 99,
    status: "completed",
    result: "succeeded",
    sourceBranch: "refs/tags/1.2.0",
    ...overrides
})

describe("toGithubRun", () => {
    it("Given a completed run that succeeded, when it is mapped, then the status is SUCCESS", () => {
        expect(toGithubRun(githubRun({ status: "completed", conclusion: "success" })).status).toBe(BuildStatus.SUCCESS)
    })

    it("Given a completed run that failed, when it is mapped, then the status is FAILED", () => {
        expect(toGithubRun(githubRun({ status: "completed", conclusion: "failure" })).status).toBe(BuildStatus.FAILED)
    })

    it("Given a run still in progress, when it is mapped, then the conclusion is ignored and the status is RUNNING", () => {
        expect(toGithubRun(githubRun({ status: "in_progress", conclusion: null })).status).toBe(BuildStatus.RUNNING)
    })

    it("Given a queued run, when it is mapped, then no finish moment is reported", () => {
        expect(toGithubRun(githubRun({ status: "queued", conclusion: null })).finishedAt).toBeUndefined()
    })

    it("Given a run started by a tag push, when it is mapped, then the tag is exposed as the ref", () => {
        expect(toGithubRun(githubRun({ status: "completed", conclusion: "success", head_branch: "1.2.0" })).ref).toBe("1.2.0")
    })

    it("Given a conclusion this platform does not know, when it is mapped, then the status is UNKNOWN", () => {
        expect(toGithubRun(githubRun({ status: "completed", conclusion: "some_new_conclusion" })).status).toBe(BuildStatus.UNKNOWN)
    })
})

describe("toGitlabRun", () => {
    it("Given a successful pipeline, when it is mapped, then the status is SUCCESS", () => {
        expect(toGitlabRun(gitlabPipeline({ status: "success" })).status).toBe(BuildStatus.SUCCESS)
    })

    it("Given a running pipeline, when it is mapped, then no finish moment is reported", () => {
        expect(toGitlabRun(gitlabPipeline({ status: "running" })).finishedAt).toBeUndefined()
    })

    it("Given a finished pipeline, when it is mapped, then the last update stands in for the finish moment", () => {
        expect(toGitlabRun(gitlabPipeline({ status: "failed" })).finishedAt).toBe("2026-08-16T10:05:00.000Z")
    })

    it("Given a manual pipeline waiting to be started, when it is mapped, then the status is QUEUED", () => {
        expect(toGitlabRun(gitlabPipeline({ status: "manual" })).status).toBe(BuildStatus.QUEUED)
    })
})

describe("toAzureRun", () => {
    it("Given a completed build that succeeded, when it is mapped, then the status is SUCCESS", () => {
        expect(toAzureRun(azureBuild({})).status).toBe(BuildStatus.SUCCESS)
    })

    it("Given a build still in progress, when it is mapped, then the previous result is ignored and the status is RUNNING", () => {
        expect(toAzureRun(azureBuild({ status: "inProgress", result: "succeeded" })).status).toBe(BuildStatus.RUNNING)
    })

    it("Given a fully qualified tag ref, when it is mapped, then the refs prefix is dropped", () => {
        expect(toAzureRun(azureBuild({ sourceBranch: "refs/tags/1.2.0" })).ref).toBe("1.2.0")
    })

    it("Given a fully qualified branch ref, when it is mapped, then the refs prefix is dropped", () => {
        expect(toAzureRun(azureBuild({ sourceBranch: "refs/heads/main" })).ref).toBe("main")
    })

    it("Given a completed build that was canceled, when it is mapped, then the status is CANCELED", () => {
        expect(toAzureRun(azureBuild({ result: "canceled" })).status).toBe(BuildStatus.CANCELED)
    })
})
