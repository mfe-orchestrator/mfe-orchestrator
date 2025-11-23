import { AddNewMicrofrontendCard, MicrofrontendCard } from '@/pages/microfrontends/partials/components'
import React from 'react'

export const MicrofrontendsGrid: React.FC<{ microfrontendsList: any[], onAddNewMicrofrontend: (parentId?: string) => void }> = ({ microfrontendsList, onAddNewMicrofrontend }) => {
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,_1fr))]">
      <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} className={microfrontendsList.length === 0 && "col-span-4"} />
      {microfrontendsList.map(mfe => (
        <MicrofrontendCard key={mfe._id} mfe={mfe} />
      ))}
    </div>
  )
}

export default MicrofrontendsGrid