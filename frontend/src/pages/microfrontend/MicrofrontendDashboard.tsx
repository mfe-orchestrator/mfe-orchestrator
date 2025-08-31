import MicrofrontendList from "@/components/microfrontend/MicrofrontendList"
import SinglePageHeader from "@/components/SinglePageHeader"
import { Input } from "@/components/ui/input/input"
import { SelectContent } from "@/components/ui/select/partials/selectContent/selectContent"
import { SelectItem } from "@/components/ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "@/components/ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "@/components/ui/select/select"
import useProjectStore from "@/store/useProjectStore"
import { Search } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const MicrofrontendDashboard = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const projectStore = useProjectStore()
    const { t } = useTranslation()

    const onResetFilters = () => {
        setSearchTerm("")
    }

    return (
        <div className="space-y-6">
            <SinglePageHeader
                title={t("microfrontend.dashboard.title")}
                description={t("microfrontend.dashboard.description")}
                buttons={
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                            <Input placeholder={t("microfrontend.dashboard.searchPlaceholder")} className="pl-8 w-full md:w-[250px]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder={t("microfrontend.dashboard.filterStatus")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("microfrontend.dashboard.statusAll")}</SelectItem>
                                <SelectItem value="ACTIVE">{t("microfrontend.dashboard.statusActive")}</SelectItem>
                                <SelectItem value="DISABLED">{t("microfrontend.dashboard.statusDisabled")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                }
            />
            <MicrofrontendList searchTerm={searchTerm} onResetFilters={onResetFilters} projectId={projectStore.project?._id} />
        </div>
    )
}

export default MicrofrontendDashboard
