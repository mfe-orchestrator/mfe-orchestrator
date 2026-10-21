import { ObjectId, Types } from "mongoose"
import { beforeEach, describe, expect, it, vi } from "vitest"

// The service reaches the application instance for its logger; importing the real one would boot
// Fastify, connect to the configured database and run the migrations.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

// A standalone mongod cannot open a transaction, and runInTransaction already knows to skip one:
// saying so here keeps the cascade under test instead of the transaction plumbing.
vi.mock("../plugins/noSQL", () => ({ isReplicaSet: false }))

import Deployment from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import EnvironmentService from "./EnvironmentService"

const newId = () => new Types.ObjectId() as unknown as ObjectId

/**
 * Deleting an environment has to take its contents with it.
 *
 * The rows are not reachable through the API once their environment is gone - the project-level
 * reader filters variables by the environments that still exist, and the deployment reader refuses
 * an environment it cannot find - so an orphan is invisible from the outside and only a test at this
 * level can see whether it was removed. That is also why there is no end-to-end test for this.
 */
describe("EnvironmentService cascade on delete", () => {
    const environmentId = newId()
    const otherEnvironmentId = newId()
    const deploymentIds = [newId(), newId()]

    /** The filters each model was asked to delete by, in the order the calls were made. */
    let calls: { model: string; filter: Record<string, unknown> }[]

    const service = () => {
        const instance = new EnvironmentService({ _id: newId() } as never)
        // Authorization is BaseAuthorizedService's job and has its own tests; here it would only
        // stand between the test and the cascade. Cast because the method is protected.
        const gate = instance as unknown as { ensureAccessToEnvironment: () => Promise<boolean> }
        vi.spyOn(gate, "ensureAccessToEnvironment").mockResolvedValue(true)
        return instance
    }

    beforeEach(() => {
        calls = []

        const record = (model: string) => (filter: Record<string, unknown>) => {
            calls.push({ model, filter })
            return Promise.resolve({ acknowledged: true, deletedCount: 1 })
        }

        vi.spyOn(Environment, "findById").mockReturnValue({
            session: () => Promise.resolve({ _id: environmentId })
        } as never)
        vi.spyOn(Deployment, "find").mockReturnValue(Promise.resolve(deploymentIds.map(_id => ({ _id }))) as never)

        vi.spyOn(Deployment, "deleteMany").mockImplementation(record("Deployment") as never)
        vi.spyOn(DeploymentToCanaryUsers, "deleteMany").mockImplementation(record("DeploymentToCanaryUsers") as never)
        vi.spyOn(GlobalVariable, "deleteMany").mockImplementation(record("GlobalVariable") as never)
        vi.spyOn(Environment, "deleteMany").mockImplementation(record("Environment") as never)
    })

    it("given an environment with deployments and variables, when it is deleted, then both go with it", async () => {
        await service().deleteSingle(environmentId)

        expect(calls.map(call => call.model)).toEqual(["DeploymentToCanaryUsers", "Deployment", "GlobalVariable", "Environment"])
    })

    it("given an environment is deleted, then the canary enrolments are removed before the deployments that own them", async () => {
        await service().deleteSingle(environmentId)

        const enrolments = calls.findIndex(call => call.model === "DeploymentToCanaryUsers")
        const deployments = calls.findIndex(call => call.model === "Deployment")

        // Once the deployments are gone there is nothing left to find their enrolments by.
        expect(enrolments).toBeLessThan(deployments)
    })

    it("given an environment is deleted, then every delete is scoped to that environment alone", async () => {
        await service().deleteSingle(environmentId)

        const scoped = (model: string) => calls.find(call => call.model === model)?.filter

        expect(scoped("Deployment")).toEqual({ environmentId: { $in: [environmentId] } })
        expect(scoped("GlobalVariable")).toEqual({ environmentId: { $in: [environmentId] } })
        expect(scoped("Environment")).toEqual({ _id: { $in: [environmentId] } })
        expect(scoped("DeploymentToCanaryUsers")).toEqual({ deploymentId: { $in: deploymentIds } })
    })

    it("given an environment that does not exist, when it is deleted, then nothing is deleted", async () => {
        vi.spyOn(Environment, "findById").mockReturnValue({ session: () => Promise.resolve(null) } as never)

        await expect(service().deleteSingle(environmentId)).rejects.toThrow()
        expect(calls).toEqual([])
    })

    it("given several environments, when they are deleted together, then one pass covers all of them", async () => {
        await service().deleteMultiple([environmentId, otherEnvironmentId])

        expect(calls.map(call => call.model)).toEqual(["DeploymentToCanaryUsers", "Deployment", "GlobalVariable", "Environment"])
        expect(calls.find(call => call.model === "Environment")?.filter).toEqual({ _id: { $in: [environmentId, otherEnvironmentId] } })
    })

    it("given no ids at all, when a bulk delete is asked for, then it is refused before touching anything", async () => {
        await expect(service().deleteMultiple([])).rejects.toThrow("Ids array is required")
        expect(calls).toEqual([])
    })
})
