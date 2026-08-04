// stateService.js

import { ClientSession, ObjectId } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Project, { IProject } from "../models/ProjectModel"
import Storage from "../models/StorageModel"
import UserProject from "../models/UserProjectModel"
import WizardProjectState, { IWizardProjectState, WizardStatus } from "../models/WizardProjectState"
import { toObjectId } from "../utils/mongooseUtils"
import { FINAL_STEP, FIRST_STEP, getStepDefinition, getStepIndex, resolveStep, transition, WIZARD_MACHINE_VERSION, WIZARD_STEPS, WizardEventType, WizardStep } from "../utils/projectWizardStateMachine"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"
import ProjectService, { ProjectCreateInput } from "./ProjectService"

export interface WizardStepDTO {
    step: WizardStep
    slug: string
    index: number
    skippable: boolean
    completed: boolean
    current: boolean
    /** The user can jump straight to this step (already visited or the current one) */
    reachable: boolean
}

export interface WizardStateDTO {
    projectId: string
    project: IProject
    status: WizardStatus
    currentStep: WizardStep
    currentStepSlug: string
    steps: WizardStepDTO[]
    canGoPrev: boolean
    canSkip: boolean
    machineVersion: number
}

export interface WizardStartInput {
    name: string
    slug?: string
    description?: string
}

export interface WizardStepLayoutDTO {
    step: WizardStep
    slug: string
    index: number
    skippable: boolean
}

export class ProjectWizardService extends BaseAuthorizedService {
    /**
     * Steps of the wizard without any project attached: lets the client render
     * the stepper before the project exists.
     */
    static getStepsLayout(): WizardStepLayoutDTO[] {
        return WIZARD_STEPS.map((definition, index) => ({
            step: definition.step,
            slug: definition.slug,
            index,
            skippable: definition.skippable
        }))
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Creates the project and opens its wizard. The project is locked (not
     * usable from the console) until the wizard reaches the final step.
     */
    async start(input: WizardStartInput, creatorUserId: ObjectId): Promise<WizardStateDTO> {
        return runInTransaction(async session => {
            const projectInput: ProjectCreateInput = {
                name: input.name,
                slug: input.slug || this.slugify(input.name),
                description: input.description,
                isActive: true
            }
            const project = await new ProjectService(this.getUser()).createRaw(projectInput, creatorUserId, session)

            // The main data have just been provided, so the wizard opens on the
            // step that follows them.
            const { step } = transition(project._id.toString(), FIRST_STEP, WizardEventType.NEXT)
            const state = await this.persistState(
                project._id,
                {
                    stateValue: step,
                    context: { projectId: project._id.toString() },
                    completedSteps: [FIRST_STEP],
                    status: WizardStatus.IN_PROGRESS
                },
                session
            )

            return this.toDTO(state, project)
        })
    }

    async getState(projectId: string): Promise<WizardStateDTO> {
        const state = await this.getOneOrFail(projectId)
        return this.toDTO(state, await this.getProjectOrFail(projectId))
    }

    /**
     * Wizard of the current user that is still running, if any. Used by the
     * client to resume an interrupted setup.
     */
    async getPending(userId: ObjectId): Promise<WizardStateDTO | null> {
        const userProjects = await UserProject.find({ userId }).select("projectId")
        if (userProjects.length === 0) {
            return null
        }

        const state = await WizardProjectState.findOne({
            projectId: { $in: userProjects.map(userProject => userProject.projectId) },
            status: WizardStatus.IN_PROGRESS
        }).sort({ updatedAt: -1 })

        if (!state) {
            return null
        }

        return this.toDTO(state, await this.getProjectOrFail(state.projectId.toString()))
    }

    /* ------------------------------------------------------------------ */
    /* Transitions                                                        */
    /* ------------------------------------------------------------------ */

    async next(projectId: string): Promise<WizardStateDTO> {
        return runInTransaction(async session => this.moveRaw(projectId, WizardEventType.NEXT, session))
    }

    async prev(projectId: string): Promise<WizardStateDTO> {
        return runInTransaction(async session => this.moveRaw(projectId, WizardEventType.PREV, session))
    }

    async skip(projectId: string): Promise<WizardStateDTO> {
        return runInTransaction(async session => this.moveRaw(projectId, WizardEventType.SKIP, session))
    }

    /**
     * Re-opens a step the user already went through. Jumping forward is not
     * allowed: the machine, not the client, decides what comes next.
     */
    async goTo(projectId: string, stepOrSlug: string): Promise<WizardStateDTO> {
        const state = await this.getOneOrFail(projectId)
        const target = resolveStep(stepOrSlug)

        if (!target) {
            throw createBusinessException({
                code: "WIZARD_UNKNOWN_STEP",
                message: `Unknown wizard step ${stepOrSlug}`,
                statusCode: 400
            })
        }

        if (target === state.stateValue) {
            return this.toDTO(state, await this.getProjectOrFail(projectId))
        }

        // A completed wizard is closed: the project is used from the console now
        if (state.status === WizardStatus.COMPLETED) {
            throw createBusinessException({
                code: "WIZARD_ALREADY_COMPLETED",
                message: "The wizard has already been completed",
                statusCode: 409
            })
        }

        const isBehind = getStepIndex(target) < getStepIndex(state.stateValue)
        if (!isBehind || !state.completedSteps.includes(target)) {
            throw createBusinessException({
                code: "WIZARD_STEP_NOT_REACHABLE",
                message: `Step ${target} cannot be opened from ${state.stateValue}`,
                statusCode: 409,
                details: { currentStep: state.stateValue, requestedStep: target }
            })
        }

        const updated = await this.persistState(projectId, { stateValue: target })
        return this.toDTO(updated, await this.getProjectOrFail(projectId))
    }

    /**
     * Updates the project main data from the first step and moves on.
     */
    async saveMainData(projectId: string, input: WizardStartInput): Promise<WizardStateDTO> {
        const state = await this.getOneOrFail(projectId)
        if (state.stateValue !== WizardStep.MAIN_DATA) {
            throw createBusinessException({
                code: "WIZARD_STEP_MISMATCH",
                message: `The wizard is on step ${state.stateValue}, not on ${WizardStep.MAIN_DATA}`,
                statusCode: 409,
                details: { currentStep: state.stateValue }
            })
        }

        await new ProjectService(this.getUser()).update(projectId, {
            name: input.name,
            description: input.description ?? null
        })

        return this.next(projectId)
    }

    /**
     * Gives up the setup: the half configured project is removed together with
     * its wizard state, so the user is not left with an unusable project.
     */
    async abort(projectId: string): Promise<void> {
        const state = await this.getOneOrFail(projectId)
        if (state.status === WizardStatus.COMPLETED) {
            throw createBusinessException({
                code: "WIZARD_ALREADY_COMPLETED",
                message: "A completed wizard cannot be aborted",
                statusCode: 409
            })
        }

        await runInTransaction(async session => {
            await new ProjectService(this.getUser()).deleteRaw(projectId, session)
            await WizardProjectState.deleteOne({ projectId: toObjectId(projectId) }).session(session ?? null)
        })
    }

    /* ------------------------------------------------------------------ */
    /* Internals                                                          */
    /* ------------------------------------------------------------------ */

    private async moveRaw(projectId: string, event: WizardEventType, session?: ClientSession): Promise<WizardStateDTO> {
        const state = await this.getOneOrFail(projectId, session)
        const project = await this.getProjectOrFail(projectId, session)

        if (state.status === WizardStatus.COMPLETED) {
            throw createBusinessException({
                code: "WIZARD_ALREADY_COMPLETED",
                message: "The wizard has already been completed",
                statusCode: 409
            })
        }

        const definition = getStepDefinition(state.stateValue)
        if (event === WizardEventType.SKIP && !definition.skippable) {
            throw createBusinessException({
                code: "WIZARD_STEP_NOT_SKIPPABLE",
                message: `Step ${state.stateValue} cannot be skipped`,
                statusCode: 409,
                details: { currentStep: state.stateValue }
            })
        }

        if (event === WizardEventType.NEXT) {
            await this.assertStepIsSatisfied(projectId, state.stateValue, session)
        }

        const result = transition(projectId, state.stateValue, event, state.context)
        if (!result.moved) {
            throw createBusinessException({
                code: "WIZARD_TRANSITION_NOT_ALLOWED",
                message: `Event ${event} is not allowed on step ${state.stateValue}`,
                statusCode: 409,
                details: { currentStep: state.stateValue, event }
            })
        }

        const goingForward = event !== WizardEventType.PREV
        const completedSteps = goingForward ? this.addCompletedStep(state.completedSteps, state.stateValue) : state.completedSteps

        const updated = await this.persistState(
            projectId,
            {
                stateValue: result.step,
                context: result.context,
                completedSteps,
                // Reaching the final step is what unlocks the project.
                status: result.step === FINAL_STEP ? WizardStatus.COMPLETED : WizardStatus.IN_PROGRESS
            },
            session
        )

        return this.toDTO(updated, project)
    }

    /**
     * Server side validation of the mandatory steps: the client cannot move
     * forward by simply calling the endpoint.
     */
    private async assertStepIsSatisfied(projectId: string, step: WizardStep, session?: ClientSession): Promise<void> {
        const projectIdObj = toObjectId(projectId)

        switch (step) {
            case WizardStep.MAIN_DATA: {
                const project = await this.getProjectOrFail(projectId, session)
                if (!project.name?.trim()) {
                    throw this.stepNotSatisfied(step, "The project needs a name")
                }
                return
            }
            case WizardStep.ENVIRONMENTS: {
                const environments = await Environment.countDocuments({ projectId: projectIdObj }).session(session ?? null)
                if (environments === 0) {
                    throw this.stepNotSatisfied(step, "At least one environment is required")
                }
                return
            }
            default:
                // Every other step is optional: its own endpoints already
                // validated the data that was sent, if any.
                return
        }
    }

    private stepNotSatisfied(step: WizardStep, message: string) {
        return createBusinessException({
            code: "WIZARD_STEP_NOT_SATISFIED",
            message,
            statusCode: 409,
            details: { currentStep: step }
        })
    }

    private addCompletedStep(completedSteps: WizardStep[], step: WizardStep): WizardStep[] {
        return completedSteps.includes(step) ? completedSteps : [...completedSteps, step]
    }

    async getOne(projectId: string | ObjectId, session?: ClientSession) {
        await this.ensureAccessToProject(projectId, session)
        const projectIdObj = toObjectId(projectId)
        return await WizardProjectState.findOne({ projectId: projectIdObj }).session(session || null)
    }

    private async getOneOrFail(projectId: string | ObjectId, session?: ClientSession): Promise<IWizardProjectState> {
        const state = await this.getOne(projectId, session)
        if (!state) {
            throw new EntityNotFoundError(`Wizard state for project ${projectId.toString()}`)
        }
        return this.migrateIfNeeded(state, session)
    }

    /**
     * Realigns a wizard opened with an older version of the machine: unknown
     * steps are dropped and the user is put back on the first step that is not
     * completed yet, instead of failing on a state the machine does not know.
     */
    private async migrateIfNeeded(state: IWizardProjectState, session?: ClientSession): Promise<IWizardProjectState> {
        const knownStep = resolveStep(state.stateValue)
        if (knownStep && state.machineVersion === WIZARD_MACHINE_VERSION) {
            return state
        }

        const completedSteps = (state.completedSteps ?? []).filter(step => Boolean(resolveStep(step)))
        state.completedSteps = completedSteps
        state.stateValue = knownStep ?? WIZARD_STEPS.find(definition => !completedSteps.includes(definition.step))?.step ?? FIRST_STEP
        state.machineVersion = WIZARD_MACHINE_VERSION
        await state.save({ session })
        return state
    }

    private async getProjectOrFail(projectId: string | ObjectId, session?: ClientSession): Promise<IProject> {
        const project = await Project.findById(toObjectId(projectId)).session(session ?? null)
        if (!project) {
            throw new EntityNotFoundError(projectId.toString())
        }
        return project
    }

    async persistState(projectId: string | ObjectId, state: Partial<IWizardProjectState>, session?: ClientSession) {
        await this.ensureAccessToProject(projectId, session)
        const projectIdObj = toObjectId(projectId)
        const wizardProjectData = await WizardProjectState.findOne({ projectId: projectIdObj }).session(session ?? null)

        if (!wizardProjectData) {
            const created = new WizardProjectState({
                projectId: projectIdObj,
                machineVersion: WIZARD_MACHINE_VERSION,
                ...state
            })
            await created.save({ session })
            return created
        }

        if (state.context !== undefined) wizardProjectData.context = state.context
        if (state.stateValue !== undefined) wizardProjectData.stateValue = state.stateValue
        if (state.completedSteps !== undefined) wizardProjectData.completedSteps = state.completedSteps
        if (state.status !== undefined) wizardProjectData.status = state.status
        wizardProjectData.machineVersion = WIZARD_MACHINE_VERSION

        await wizardProjectData.save({ session })
        return wizardProjectData
    }

    private toDTO(state: IWizardProjectState, project: IProject): WizardStateDTO {
        const currentIndex = getStepIndex(state.stateValue)
        const definition = getStepDefinition(state.stateValue)
        const isRunning = state.status !== WizardStatus.COMPLETED

        const steps: WizardStepDTO[] = WIZARD_STEPS.map((stepDefinition, index) => ({
            step: stepDefinition.step,
            slug: stepDefinition.slug,
            index,
            skippable: stepDefinition.skippable,
            completed: state.completedSteps.includes(stepDefinition.step),
            current: stepDefinition.step === state.stateValue,
            // Once completed the wizard is closed: no step can be re-opened
            reachable: stepDefinition.step === state.stateValue || (isRunning && index < currentIndex && state.completedSteps.includes(stepDefinition.step))
        }))

        return {
            projectId: project._id.toString(),
            project,
            status: state.status,
            currentStep: state.stateValue,
            currentStepSlug: definition.slug,
            steps,
            canGoPrev: currentIndex > 0 && isRunning,
            canSkip: definition.skippable && isRunning,
            machineVersion: state.machineVersion
        }
    }

    private slugify(value: string): string {
        return value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
    }

    /**
     * Counters shown on the final step, so the user sees what has actually been
     * configured during the wizard.
     */
    async getSetupRecap(projectId: string) {
        await this.ensureAccessToProject(projectId)
        const projectIdObj = toObjectId(projectId)
        return {
            environments: await Environment.countDocuments({ projectId: projectIdObj }),
            storages: await Storage.countDocuments({ projectId: projectIdObj }),
            codeRepositories: await CodeRepository.countDocuments({ projectId: projectIdObj }),
            users: await UserProject.countDocuments({ projectId: projectIdObj })
        }
    }
}

export default ProjectWizardService
