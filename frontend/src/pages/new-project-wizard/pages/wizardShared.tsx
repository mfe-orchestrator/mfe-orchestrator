import { Check, Info } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Project } from "@/hooks/apiClients/useProjectApi"
import { cn } from "@/utils/styleUtils"

export interface WizardStepMeta {
    key: string
    label: string
    icon: React.ReactNode
}

/** Props shared by every wizard step */
export interface WizardStepProps {
    project?: Project
    /** step 1 only: notify the orchestrator that the project has been created */
    onCreated?: (project: Project) => void
    onNext: () => void
    onBack?: () => void
    onSkip?: () => void
    isFirst?: boolean
}

/* -------------------------------------------------------------------------- */

interface WizardStepperProps {
    steps: WizardStepMeta[]
    current: number
}

export const WizardStepper: React.FC<WizardStepperProps> = ({ steps, current }) => (
    <ol className="flex items-center w-full">
        {steps.map((step, index) => {
            const isDone = index < current
            const isActive = index === current
            return (
                <li key={step.key} className={cn("flex items-center", index < steps.length - 1 && "flex-1")}>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        <div
                            className={cn(
                                "h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                isActive && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--ring))]",
                                isDone && "border-primary bg-primary text-primary-foreground",
                                !isActive && !isDone && "border-border bg-card text-muted-foreground"
                            )}
                        >
                            {isDone ? <Check className="size-5" /> : step.icon}
                        </div>
                        <span className={cn("text-xs font-medium text-center whitespace-nowrap", isActive ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                    </div>
                    {index < steps.length - 1 && <div className={cn("flex-1 h-0.5 mx-2 -mt-6 rounded transition-colors duration-300", isDone ? "bg-primary" : "bg-border")} />}
                </li>
            )
        })}
    </ol>
)

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

export const WizardFooter: React.FC<WizardFooterProps> = ({ onBack, onSkip, skipLabel, nextLabel, loading, onNext }) => {
    const { t } = useTranslation()

    return (
        <>
            <div>
                {onBack && (
                    <Button dataTestId="wizard-back" type="button" variant="ghost" onClick={onBack} disabled={loading}>
                        {t("newProjectWizard.footer.back")}
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-2">
                {onSkip && (
                    <Button dataTestId="wizard-skip" type="button" variant="ghost" onClick={onSkip} disabled={loading}>
                        {skipLabel ?? t("newProjectWizard.footer.skip")}
                    </Button>
                )}
                <Button dataTestId="wizard-next" type={onNext ? "button" : "submit"} variant="primary" onClick={onNext} disabled={loading}>
                    {loading ? t("newProjectWizard.footer.loading") : (nextLabel ?? t("newProjectWizard.footer.next"))}
                </Button>
            </div>
        </>
    )
}
