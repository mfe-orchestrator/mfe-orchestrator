
import MicrofrontendList from "@/components/microfrontend/MicrofrontendList"
import SinglePageHeader from "@/components/SinglePageHeader"
import { Input } from "@/components/ui/input/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import useProjectStore from "@/store/useProjectStore"
import { Search } from "lucide-react"
import { useState } from "react"

const MicrofrontendDashboard = () => {
    const [searchTerm, setSearchTerm] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const projectStore = useProjectStore()

    const onResetFilters = () => {
        setSearchTerm("")
        setStatusFilter("all")
    }

    return (
        <div className="space-y-6">
            <SinglePageHeader
                title={"Microfrontends"}
                description={"Gestisci i microfrontends del tuo progetto"}
                buttons={
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                            <Input placeholder="Cerca microfrontend..." className="pl-8 w-full md:w-[250px]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filtra per stato" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tutti</SelectItem>
                                <SelectItem value="ACTIVE">Attivi</SelectItem>
                                <SelectItem value="DISABLED">Disabilitati</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                }
            />
            <MicrofrontendList searchTerm={searchTerm} statusFilter={statusFilter} onResetFilters={onResetFilters} projectId={projectStore.project?._id} />
        </div>
    )
}

export default MicrofrontendDashboard;
