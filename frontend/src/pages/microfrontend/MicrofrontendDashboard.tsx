import MicrofrontendList from "@/components/microfrontend/MicrofrontendList"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Button } from "@/components/ui/button/button"
import { Input } from "@/components/ui/input/input"
import useProjectStore from "@/store/useProjectStore"
import { CirclePlus, Search } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

const MicrofrontendDashboard = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const projectStore = useProjectStore()
    const { t } = useTranslation()
    const navigate = useNavigate()

    const onResetFilters = () => {
        setSearchTerm("")
    }

    const onAddNewMicrofrontend = () => {
        navigate(`/microfronted/new`)
    }

    return (
        <SinglePageLayout
            title={t("microfrontend.dashboard.title")}
            description={t("microfrontend.dashboard.description")}
            right={
                <div className="flex-[1_1_280px] flex items-center justify-end gap-2 max-w-xs">
                    <div className="relative w-full flex-grow">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                        <Input placeholder={t("microfrontend.dashboard.searchPlaceholder")} className="pl-8 w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            }
            left={
                <div>
                    <Button variant="secondary" onClick={onAddNewMicrofrontend} className="flex-[0_0_auto]">
                        <CirclePlus />
                        {t("microfrontend.add_new")}
                    </Button>
                </div>
            }
            lrContainerClassname="flex-wrap-reverse"
        >
            <MicrofrontendList searchTerm={searchTerm} onResetFilters={onResetFilters} projectId={projectStore.project?._id} />
        </SinglePageLayout>
    )
}

export default MicrofrontendDashboard
