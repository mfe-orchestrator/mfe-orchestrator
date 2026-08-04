import { Check, Database, FolderPlus, GitBranch, Info, Layers, PartyPopper, Users } from "lucide-react"
import { Button } from "@/components/atoms"
import { Project } from "@/hooks/apiClients/useProjectApi"
import { WizardStep, WizardStepDTO } from "@/types/ProjectWizardDTO"
import { cn } from "@/utils/styleUtils"

/** Labels and icons of the steps; the steps themselves come from the backend. */
export const STEP_META: Record<WizardStep, { label: string; icon: React.ReactNode }> = {
    [WizardStep.MAIN_DATA]: { label: "Nome", icon: <FolderPlus className="size-5" /> },
    [WizardStep.ENVIRONMENTS]: { label: "Ambienti", icon: <Layers className="size-5" /> },
    [WizardStep.STORAGES]: { label: "Storage", icon: <Database className="size-5" /> },
    [WizardStep.REPOSITORIES]: { label: "Repository", icon: <GitBranch className="size-5" /> },
    [WizardStep.TEAM_MATES]: { label: "Collaboratori", icon: <Users className="size-5" /> },
    [WizardStep.COMPLETED]: { label: "Fine", icon: <PartyPopper className="size-5" /> }
}

/** Props shared by every wizard step */
export interface WizardStepProps {
    project?: Project
    /** Moves to the step the backend decides comes next */
    onNext: () => void
    onBack?: () => void
    onSkip?: () => void
    /** A transition is in flight: the step must not accept other commands */
    loading?: boolean
}

/* -------------------------------------------------------------------------- */

interface WizardStepperProps {
    /** Steps as returned by the backend; the final one is not shown */
    steps: WizardStepDTO[]
    /** Only the steps flagged reachable by the backend can be clicked */
    onStepClick?: (step: WizardStepDTO) => void
}

export const WizardStepper: React.FC<WizardStepperProps> = ({ steps, onStepClick }) => {
    const visibleSteps = steps.filter(step => step.step !== WizardStep.COMPLETED)

    return (
        <ol className="flex items-center w-full">
            {visibleSteps.map((step, index) => {
                const isDone = step.completed && !step.current
                const isActive = step.current
                const isClickable = Boolean(onStepClick) && step.reachable && !step.current
                const meta = STEP_META[step.step]

                return (
                    <li key={step.step} className={cn("flex items-center", index < visibleSteps.length - 1 && "flex-1")}>
                        <div className="flex flex-col items-center gap-2 shrink-0">
                            <button
                                type="button"
                                data-testid={`wizard-stepper-${step.slug}`}
                                disabled={!isClickable}
                                onClick={() => onStepClick?.(step)}
                                aria-current={isActive ? "step" : undefined}
                                className={cn(
                                    "h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                    isActive && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--ring))]",
                                    isDone && "border-primary bg-primary text-primary-foreground",
                                    !isActive && !isDone && "border-border bg-card text-muted-foreground",
                                    isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
                                )}
                            >
                                {isDone ? <Check className="size-5" /> : meta.icon}
                            </button>
                            <span className={cn("text-xs font-medium text-center whitespace-nowrap", isActive ? "text-foreground" : "text-muted-foreground")}>{meta.label}</span>
                        </div>
                        {index < visibleSteps.length - 1 && <div className={cn("flex-1 h-0.5 mx-2 -mt-6 rounded transition-colors duration-300", isDone ? "bg-primary" : "bg-border")} />}
                    </li>
                )
            })}
        </ol>
    )
}

/* -------------------------------------------------------------------------- */

interface StepShellProps extends React.PropsWithChildren {
    title: string
    description?: string
    footer?: React.ReactNode
    /** Reassuring note shown above the footer on optional/skippable steps */
    skippableNote?: React.ReactNode
}

export const StepShell: React.FC<StepShellProps> = ({ title, description, children, footer, skippableNote }) => (
    <div className="bg-card border border-border rounded-xl shadow-card mt-8 flex flex-col">
        <div className="p-6 md:p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h2 data-testid="wizard-step-title" className="text-2xl font-semibold text-foreground">
                    {title}
                </h2>
                {description && <p className="text-foreground-secondary">{description}</p>}
            </div>
            {children}
        </div>
        {skippableNote && (
            <p className="px-6 md:px-8 pb-4 -mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4 shrink-0 text-primary" />
                {skippableNote}
            </p>
        )}
        {footer && <div className="border-t border-divider px-6 md:px-8 py-4 flex items-center justify-between gap-3">{footer}</div>}
    </div>
)

/* -------------------------------------------------------------------------- */

interface WizardFooterProps {
    onBack?: () => void
    onSkip?: () => void
    skipLabel?: string
    nextLabel?: string
    loading?: boolean
    /** when set, the primary button is a plain button calling this instead of submitting a form */
    onNext?: () => void
}

export const WizardFooter: React.FC<WizardFooterProps> = ({ onBack, onSkip, skipLabel = "Salta", nextLabel = "Continua", loading, onNext }) => (
    <>
        <div>
            {onBack && (
                <Button dataTestId="wizard-back" type="button" variant="ghost" onClick={onBack} disabled={loading}>
                    Indietro
                </Button>
            )}
        </div>
        <div className="flex items-center gap-2">
            {onSkip && (
                <Button dataTestId="wizard-skip" type="button" variant="ghost" onClick={onSkip} disabled={loading}>
                    {skipLabel}
                </Button>
            )}
            <Button dataTestId="wizard-next" type={onNext ? "button" : "submit"} variant="primary" onClick={onNext} disabled={loading}>
                {loading ? "Attendere…" : nextLabel}
            </Button>
        </div>
    </>
)
