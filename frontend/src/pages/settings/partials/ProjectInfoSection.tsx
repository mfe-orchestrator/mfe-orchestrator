import { Card, CardContent, CardHeader, CardTitle, CopyableValue, DescriptionItem, DescriptionList } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Project } from "@/hooks/apiClients/useProjectApi"

interface ProjectInfoSectionProps extends Project {
    onUpdateProjectName: (newName: string) => Promise<void>
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({ name, slug, _id }) => {
    const { t } = useTranslation()

    const copyProps = { copyLabel: t("common.copy"), copiedLabel: t("common.copied") }

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.projectInfo.title")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                {/* flex-row: le tre voci stanno su una riga che va a capo, non incolonnate */}
                <DescriptionList className="flex-row flex-wrap">
                    <DescriptionItem className="flex-[1_1_200px]" label={t("settings.projectInfo.name")}>
                        {name || "-"}
                    </DescriptionItem>

                    <DescriptionItem className="flex-[1_1_200px]" label={t("settings.projectInfo.slug")}>
                        {slug ? <CopyableValue value={slug} {...copyProps} /> : "-"}
                    </DescriptionItem>

                    <DescriptionItem className="flex-[1_1_200px]" label={t("settings.projectInfo.id")}>
                        {_id ? <CopyableValue value={_id} {...copyProps} /> : "-"}
                    </DescriptionItem>
                </DescriptionList>
            </CardContent>
        </Card>
    )
}

export default ProjectInfoSection
