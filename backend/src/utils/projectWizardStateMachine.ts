// wizardMachine.js
import { createMachine } from "xstate"

export interface NewProjectWizardContext<A> {
    contextData?: A
    id?: string
}

export const getMachine = <A>({ contextData, id = "wizard" }: NewProjectWizardContext<A>) => {
    const wizardMachine = createMachine({
        id,
        initial: "mainData",
        context: {
            ...contextData
        },
        states: {
            mainData: {
                on: {
                    NEXT: "environments"
                }
            },
            environments: {
                on: {
                    NEXT: "codeRepositories",
                    PREV: "mainData"
                }
            },
            codeRepositories: {
                on: {
                    NEXT: "mainData",
                    PREV: "hosting"
                }
            },
            hosting: {
                on: {
                    NEXT: "teamMates",
                    PREV: "repositories"
                }
            },
            teamMates: {
                on: {
                    PREV: "hosting",
                    NEXT: "completed"
                }
            },
            completed: { type: "final" }
        }
    })

    return wizardMachine
}
