import MicrofrontendFlowLayout from "@/components/microfrontend/MicrofrontendFlowLayout"
import MicrofrontendList from "@/components/microfrontend/MicrofrontendList"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Button } from "@/components/ui/button/button"
import { Input } from "@/components/ui/input/input"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import useProjectStore from "@/store/useProjectStore"
import { CirclePlus, Search } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

const MicrofrontendDashboard = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const projectStore = useProjectStore()
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const { t } = useTranslation()
	const navigate = useNavigate()
    const [tabsValue, setTabsValue] = useState<"flow" | "grid" | "list">("flow")

    const onResetFilters = () => {
        setSearchTerm("")
    }

    const onAddNewMicrofrontend = async (parentId?: string) => {
        const repositories = await codeRepositoriesApi.getRepositoriesByProjectId(projectStore.project?._id!)
        if(repositories && repositories.length > 0){
            if(parentId){
                navigate(`/templates-library?parentId=${parentId}`)
            }else{
                navigate(`/templates-library`)
            }
        }else{
            if(parentId){
                navigate(`/microfrontend/new?parentId=${parentId}`)
            }else{
                navigate(`/microfrontend/new`)
            }
        }
    }

    return (
        <SinglePageLayout
            title={t("microfrontend.dashboard.title")}
            description={t("microfrontend.dashboard.description")}
            left={
                <div className="flex-[1_1_280px] flex items-center justify-end gap-2 @[509px]:max-w-xs">
                    <div className="relative w-full flex-grow">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                        <Input placeholder={t("microfrontend.dashboard.searchPlaceholder")} className="pl-8 w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            }
            right={
                tabsValue !== "grid" ? (
                    <div>
                        <Button variant="secondary" onClick={()=>onAddNewMicrofrontend()} className="flex-[0_0_auto]">
                            <CirclePlus />
                            {t("microfrontend.add_new")}
                        </Button>
                    </div>
                ) : null
            }
        >
            <MicrofrontendList searchTerm={searchTerm} onResetFilters={onResetFilters} projectId={projectStore.project?._id} setTabsValue={setTabsValue} onAddNewMicrofrontend={onAddNewMicrofrontend} />
        </SinglePageLayout>
    )
}

export default MicrofrontendDashboard
