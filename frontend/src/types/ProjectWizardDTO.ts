/** Mirrors backend/src/utils/projectWizardStateMachine.ts */
export enum WizardStep {
    MAIN_DATA = "mainData",
    ENVIRONMENTS = "environments",
    STORAGES = "storages",
    REPOSITORIES = "repositories",
    TEAM_MATES = "teamMates",
    COMPLETED = "completed"
}

export enum WizardStatus {
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED"
}

export interface WizardStepDTO {
    step: WizardStep
    /** Url segment of the step, decided by the backend */
    slug: string
    index: number
    skippable: boolean
    completed: boolean
    current: boolean
    reachable: boolean
}

/**
 * Wizard status attached to every project of the projects list: it tells which
 * projects are still locked behind their setup and where to resume them.
 */
export interface ProjectWizardSummaryDTO {
    status: WizardStatus
    currentStep: WizardStep
    currentStepSlug: string
}

/** Route the wizard of a project lives on */
export const getWizardStepPath = (projectId: string, stepSlug: string) => `/project-wizard/${projectId}/${stepSlug}`

export const isProjectLockedByWizard = (wizard?: ProjectWizardSummaryDTO) => wizard?.status === WizardStatus.IN_PROGRESS
