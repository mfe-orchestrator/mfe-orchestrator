import { CodeBlock } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { SettingsDetails } from "./SettingsDetails"

/** L'account locale con cui la console chiama l'API di Argo CD: solo API key, nessuna password */
const ACCOUNT_CONFIG = `apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  accounts.orchestrator: apiKey`

/** Tutto quello che la console crea inizia con mfe-: le regole non toccano gli oggetti degli altri */
const RBAC_CONFIG = `apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-rbac-cm
  namespace: argocd
data:
  policy.csv: |
    p, role:orchestrator, projects, *, mfe-*, allow
    p, role:orchestrator, applications, *, mfe-*/*, allow
    p, role:orchestrator, applicationsets, *, mfe-*/*, allow
    p, role:orchestrator, repositories, *, *, allow
    g, orchestrator, role:orchestrator`

/** Senza, il controller ignora applicationsSync: create-update e un values file cancellato si porterebbe via l'applicazione */
const CONTROLLER_CONFIG = `apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cmd-params-cm
  namespace: argocd
data:
  applicationsetcontroller.enable.policy.override: "true"`

const TOKEN_COMMAND = "argocd account generate-token --account orchestrator"

const PERMISSIONS = ["projects", "applications", "applicationsets", "repositories"] as const

/** Cosa preparare su Argo CD perche' la console lavori senza intoppi: l'account, i suoi permessi e la policy del controller */
export const ArgoCdAccountSetup: React.FC = () => {
    const { t } = useTranslation()
    const codeBlock = (label: string, code: string) => <CodeBlock label={label} code={code} copyable copyLabel={t("common.copy")} copiedLabel={t("common.copied")} />

    return (
        <SettingsDetails summary={t("settings.argoCd.setup.summary")} dataTestId="argocd-setup">
            <p>{t("settings.argoCd.setup.intro")}</p>
            {codeBlock(t("settings.argoCd.setup.account"), ACCOUNT_CONFIG)}
            {codeBlock(t("settings.argoCd.setup.rbac"), RBAC_CONFIG)}
            <ul className="flex list-disc flex-col gap-1 pl-5">
                {PERMISSIONS.map(permission => (
                    <li key={permission}>
                        <code>{permission}</code>: {t(`settings.argoCd.setup.permissions.${permission}`)}
                    </li>
                ))}
            </ul>
            <p>{t("settings.argoCd.setup.mergeHint")}</p>
            {codeBlock(t("settings.argoCd.setup.controller"), CONTROLLER_CONFIG)}
            {codeBlock(t("settings.argoCd.setup.token"), TOKEN_COMMAND)}
            <p>{t("settings.argoCd.setup.version")}</p>
        </SettingsDetails>
    )
}

export default ArgoCdAccountSetup
