import React from "react"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { AddNewMicrofrontendCard, MicrofrontendCard } from "@/pages/microfrontends/partials/components"

interface MicrofrontendsGridProps {
    microfrontends: Microfrontend[]
    onAddNewMicrofrontend: (parentId?: string) => void
}

export const MicrofrontendsGrid: React.FC<MicrofrontendsGridProps> = ({ microfrontends, onAddNewMicrofrontend }) => {
    return (
        // `min(100%, 300px)` keeps the tracks from overflowing the page on narrow viewports.
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
            {microfrontends.map(mfe => (
                <MicrofrontendCard key={mfe._id} mfe={mfe} />
            ))}
            <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} />
        </div>
    )
}

export default MicrofrontendsGrid
