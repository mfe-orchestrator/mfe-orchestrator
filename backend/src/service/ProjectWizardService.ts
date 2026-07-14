// stateService.js

import { ClientSession, ObjectId } from "mongoose"
import { interpret } from "xstate"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import WizardProjectState, { IWizardProjectState } from "../models/WizardProjectState"
import { toObjectId } from "../utils/mongooseUtils"
import * as projectWizardStateMachine from "../utils/projectWizardStateMachine"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"
import ProjectService, { ProjectCreateInput } from "./ProjectService"

export class ProjectWizardService extends BaseAuthorizedService {
    async prev(projectId: string): Promise<IWizardProjectState> {
        return runInTransaction(async session => this.prevRaw(projectId, session))
    }

    async next(projectId: string): Promise<IWizardProjectState> {
        return runInTransaction(async session => this.nextRaw(projectId, session))
    }

    private async moveRaw(projectId: string, action: "PREV" | "NEXT", session?: ClientSession): Promise<IWizardProjectState> {
        const projectState = await this.getOne(projectId, session)
        if (!projectState) {
            throw new EntityNotFoundError("Project state not found")
        }

        const machine = projectWizardStateMachine.getMachine({
            id: projectId,
            contextData: projectState.context
        })
        const runningMachine = interpret(machine).start()
        runningMachine.send({
            type: action
        })
        const snapshot = runningMachine.getSnapshot()
        return await this.persistState(projectId, { stateValue: snapshot.value.toString(), context: snapshot.context })
    }

    async prevRaw(projectId: string, session?: ClientSession): Promise<IWizardProjectState> {
        return this.moveRaw(projectId, "PREV", session)
    }

    async nextRaw(projectId: string, session?: ClientSession): Promise<IWizardProjectState> {
        return this.moveRaw(projectId, "NEXT", session)
    }
    async getOne(projectId: string | ObjectId, session?: ClientSession) {
        await this.ensureAccessToProject(projectId, session)
        const projectIdObj = toObjectId(projectId)
        return await WizardProjectState.findOne({ projectId: projectIdObj }).session(session || null)
    }

    async persistState(projectId: string | ObjectId, state: Partial<IWizardProjectState>) {
        await this.ensureAccessToProject(projectId)
        const projectIdObj = toObjectId(projectId)
        const wizardProjectData = await WizardProjectState.findOne({ projectId: projectIdObj })

        if (!wizardProjectData) {
            return new WizardProjectState({
                projectId: projectIdObj,
                ...state
            }).save()
        } else {
            wizardProjectData.context = state.context || {}
            wizardProjectData.stateValue = state.stateValue!
            await wizardProjectData.save()
            return wizardProjectData
        }
    }

    async createNew(newProjectDto: ProjectCreateInput, creatorUserId: ObjectId) {
        const project = await new ProjectService().create({ ...newProjectDto, isActive: true }, creatorUserId)
        const machine = projectWizardStateMachine.getMachine({
            id: project._id.toString()
        })

        const runningMachine = interpret(machine).start()
        const snapshot = runningMachine.getSnapshot()
        await this.persistState(project._id, { stateValue: snapshot.value.toString(), context: snapshot.context })
        return project
    }
}

export default ProjectWizardService
