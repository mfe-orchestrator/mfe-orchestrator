// stateService.js

import { ObjectId } from "mongoose"
import { interpret } from "xstate"
import WizardProjectState, { IWizardProjectState } from "../models/WizardProjectState"
import { toObjectId } from "../utils/mongooseUtils"
import * as projectWizardStateMachine from "../utils/projectWizardStateMachine"
import BaseAuthorizedService from "./BaseAuthorizedService"
import ProjectService, { ProjectCreateInput } from "./ProjectService"

export class ProjectWizardService extends BaseAuthorizedService {
    async loadState(projectId: string | ObjectId) {
        await this.ensureAccessToProject(projectId)
        const projectIdObj = toObjectId(projectId)
        return await WizardProjectState.findOne({ projectId: projectIdObj })
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
