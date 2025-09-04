import MicrofrontendList from "@/components/microfrontend/MicrofrontendList"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Input } from "@/components/ui/input/input"
import useProjectStore from "@/store/useProjectStore"
import { Search } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const MicrofrontendDashboard = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const projectStore = useProjectStore()
    const { t } = useTranslation()

    const onResetFilters = () => {
        setSearchTerm("")
    }

    return (
            <SinglePageLayout
                title={t("microfrontend.dashboard.title")}
                description={t("microfrontend.dashboard.description")}
                right={
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                            <Input placeholder={t("microfrontend.dashboard.searchPlaceholder")} className="pl-8 w-full md:w-[250px]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                }
            >
            <MicrofrontendList searchTerm={searchTerm} onResetFilters={onResetFilters} projectId={projectStore.project?._id} />
        </SinglePageLayout>
    )
}

export default MicrofrontendDashboard
