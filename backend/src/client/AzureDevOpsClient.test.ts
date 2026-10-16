import axios, { AxiosError, AxiosHeaders } from "axios"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BusinessException } from "../errors/BusinessException"
import AzureDevOpsClient, { AZURE_DEVOPS_VARIABLE_GROUPS_UNAUTHORIZED } from "./AzureDevOpsClient"

const answered = (status: number) =>
    new AxiosError("Request failed", String(status), undefined, undefined, {
        status,
        statusText: "",
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() }
    })

const params = { accessToken: "pat", organization: "org", projectId: "project", secretName: "SECRET", variableGroupName: "GROUP" }

afterEach(() => {
    vi.restoreAllMocks()
})

describe("AzureDevOpsClient variable groups", () => {
    /** The token lists the projects, so the connection test passed: only the variable groups refuse it. */
    it.each([401, 403])("given Azure answers %i, when the variable groups are read, then the missing scope is named", async status => {
        vi.spyOn(axios, "request").mockRejectedValue(answered(status))

        const read = new AzureDevOpsClient().checkOrganizationSecretExists(params)

        await expect(read).rejects.toBeInstanceOf(BusinessException)
        await expect(read).rejects.toMatchObject({ code: AZURE_DEVOPS_VARIABLE_GROUPS_UNAUTHORIZED, statusCode: 400 })
    })

    it("given any other failure, when the variable groups are read, then it is passed on unchanged", async () => {
        const failure = answered(500)
        vi.spyOn(axios, "request").mockRejectedValue(failure)

        await expect(new AzureDevOpsClient().checkOrganizationSecretExists(params)).rejects.toBe(failure)
    })

    it("given the group holds the secret, when it is checked, then it exists", async () => {
        vi.spyOn(axios, "request").mockResolvedValue({ data: { value: [{ name: "GROUP", variables: { SECRET: {} } }] } })

        await expect(new AzureDevOpsClient().checkOrganizationSecretExists(params)).resolves.toBe(true)
    })
})
