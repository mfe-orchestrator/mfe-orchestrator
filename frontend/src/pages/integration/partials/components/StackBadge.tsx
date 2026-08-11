import { useTranslation } from "react-i18next"
import { IMicrofrontendStackDTO } from "@/hooks/apiClients/useServeApi"

const FRAMEWORK_LABELS: Record<string, string> = {
    REACT: "React",
    VUE: "Vue",
    ANGULAR: "Angular"
}

const COMPILER_LABELS: Record<string, string> = {
    VITE: "Vite",
    WEBPACK: "Webpack",
    WEBCOMPONENT: "Web Component"
}

const SOURCE_KEYS: Record<string, string> = {
    TEMPLATE: "integration.fe_integration_tab.stack_from_template",
    DETECTED: "integration.fe_integration_tab.stack_detected",
    MANUAL: "integration.fe_integration_tab.stack_manual"
}

/** Says which stack the instructions were generated for, and how the platform knows it. */
export const StackBadge: React.FC<{ stack: IMicrofrontendStackDTO }> = ({ stack }) => {
    const { t } = useTranslation()

    if (!stack.framework && !stack.compiler) {
        return null
    }

    const parts = [stack.framework && FRAMEWORK_LABELS[stack.framework], stack.compiler && COMPILER_LABELS[stack.compiler]].filter(Boolean)
    const sourceKey = stack.source && SOURCE_KEYS[stack.source]

    return (
        <p className="text-sm text-foreground-secondary">
            <span className="font-medium">{t("integration.fe_integration_tab.detected_stack")}:</span> {parts.join(" + ")}
            {sourceKey && <span> ({t(sourceKey)})</span>}
        </p>
    )
}

export default StackBadge
