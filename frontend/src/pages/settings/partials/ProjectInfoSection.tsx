import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Project } from "@/hooks/apiClients/useProjectApi"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"

interface InfoItemProps {
    label: string
    value: string
    isMonospace?: boolean
    copyable?: boolean
}

const InfoItem: React.FC<InfoItemProps> = ({ label, value, isMonospace = false, copyable = true }) => {
    const { t } = useTranslation()

    return (
        <div className="flex-[1_1_200px] flex flex-col gap-1">
            <Label className="text-sm text-foreground-secondary">{label}</Label>
            <div className="flex items-center flex-1 gap-3">
                <span className={`${isMonospace && "font-mono"} break-all @sm/settings-card:break-normal`}>{value || "-"}</span>
                {copyable && value && (
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    navigator.clipboard.writeText(value)
                                }}
                            >
                                <Copy />
                                <span className="sr-only">{t("common.copy")}</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t("common.copy")}</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    )
}

interface ProjectInfoSectionProps extends Project {
    onUpdateProjectName: (newName: string) => Promise<void>
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({ name, slug, _id }) => {
    const { t } = useTranslation()

    return (
        <Card className="pt-4 @container/settings-card">
            <CardHeader>
                <h2 className="text-lg font-semibold">{t("settings.projectInfo.title")}</h2>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex flex-wrap gap-4">
                    <InfoItem label={t("settings.projectInfo.name")} value={name} copyable={false} />

                    <InfoItem label={t("settings.projectInfo.slug")} value={slug} />

                    <InfoItem label={t("settings.projectInfo.id")} value={_id} />
                </div>
            </CardContent>
        </Card>
    )
}

export default ProjectInfoSection