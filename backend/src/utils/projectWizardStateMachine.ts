import { createActor, createMachine } from "xstate"

/**
 * The wizard is orchestrated by the backend: the steps, their order, which of
 * them can be skipped and which transitions are legal are all defined here.
 * The frontend only renders the step the backend tells it to render.
 */
export enum WizardStep {
    MAIN_DATA = "mainData",
    ENVIRONMENTS = "environments",
    STORAGES = "storages",
    REPOSITORIES = "repositories",
    TEAM_MATES = "teamMates",
    COMPLETED = "completed"
}

export enum WizardEventType {
    NEXT = "NEXT",
    PREV = "PREV",
    SKIP = "SKIP"
}

export interface WizardStepDefinition {
    step: WizardStep
    /** Url segment used to build the frontend route of the step */
    slug: string
    /** The step can be left without providing any data */
    skippable: boolean
}

/**
 * Bumped whenever the steps or the transitions change, so that wizards
 * persisted with an older layout can be recognized.
 */
export const WIZARD_MACHINE_VERSION = 2

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
    { step: WizardStep.MAIN_DATA, slug: "main-data", skippable: false },
    { step: WizardStep.ENVIRONMENTS, slug: "environments", skippable: false },
    { step: WizardStep.STORAGES, slug: "storages", skippable: true },
    { step: WizardStep.REPOSITORIES, slug: "repositories", skippable: true },
    { step: WizardStep.TEAM_MATES, slug: "team-mates", skippable: true },
    { step: WizardStep.COMPLETED, slug: "completed", skippable: false }
] as const

export const FIRST_STEP = WIZARD_STEPS[0].step
export const FINAL_STEP = WizardStep.COMPLETED

export const getStepDefinition = (step: WizardStep): WizardStepDefinition => {
    const definition = WIZARD_STEPS.find(current => current.step === step)
    if (!definition) {
        throw new Error(`Unknown wizard step ${step}`)
    }
    return definition
}

/** Resolves a step either from its machine name (`teamMates`) or from its route slug (`team-mates`) */
export const resolveStep = (value: string): WizardStep | undefined => WIZARD_STEPS.find(definition => definition.step === value || definition.slug === value)?.step

export const getStepIndex = (step: WizardStep): number => WIZARD_STEPS.findIndex(definition => definition.step === step)

export interface NewProjectWizardContext<A> {
    contextData?: A
    id?: string
    /**
     * State the machine has to be restored to. Without it every transition
     * would restart from the first step.
     */
    initialStep?: WizardStep
}

export const getMachine = <A>({ contextData, id = "wizard", initialStep = FIRST_STEP }: NewProjectWizardContext<A>) => {
    const wizardMachine = createMachine({
        id,
        initial: initialStep,
        context: {
            ...contextData
        },
        states: {
            [WizardStep.MAIN_DATA]: {
                on: {
                    NEXT: WizardStep.ENVIRONMENTS
                }
            },
            [WizardStep.ENVIRONMENTS]: {
                on: {
                    NEXT: WizardStep.STORAGES,
                    PREV: WizardStep.MAIN_DATA
                }
            },
            [WizardStep.STORAGES]: {
                on: {
                    NEXT: WizardStep.REPOSITORIES,
                    SKIP: WizardStep.REPOSITORIES,
                    PREV: WizardStep.ENVIRONMENTS
                }
            },
            [WizardStep.REPOSITORIES]: {
                on: {
                    NEXT: WizardStep.TEAM_MATES,
                    SKIP: WizardStep.TEAM_MATES,
                    PREV: WizardStep.STORAGES
                }
            },
            [WizardStep.TEAM_MATES]: {
                on: {
                    NEXT: WizardStep.COMPLETED,
                    SKIP: WizardStep.COMPLETED,
                    PREV: WizardStep.REPOSITORIES
                }
            },
            [WizardStep.COMPLETED]: { type: "final" }
        }
    })

    return wizardMachine
}

export interface WizardTransitionResult {
    step: WizardStep
    context: Record<string, unknown>
    /** False when the machine refused the event (illegal transition) */
    moved: boolean
}

/**
 * Pure transition: restores the machine on `step`, applies `event` and returns
 * the resulting step. The machine - not the caller - decides where to go.
 */
export const transition = (id: string, step: WizardStep, event: WizardEventType, context: Record<string, unknown> = {}): WizardTransitionResult => {
    const actor = createActor(getMachine({ id, contextData: context, initialStep: step })).start()
    actor.send({ type: event })
    const snapshot = actor.getSnapshot()
    actor.stop()

    const nextStep = snapshot.value as WizardStep
    return {
        step: nextStep,
        context: (snapshot.context ?? {}) as Record<string, unknown>,
        moved: nextStep !== step
    }
}
