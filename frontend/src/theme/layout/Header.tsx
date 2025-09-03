import SwitchProjectButton from "@/components/SwitchProjectButton"
import useProjectStore from "@/store/useProjectStore"

const Header: React.FC = () => {
    const { project } = useProjectStore()

    return (
        <header className="bg-background border-b border-border h-16 flex items-center justify-between px-6">
            <div className="flex flex-row gap-3 items-center">
                <SwitchProjectButton />
                <h1 className="text-xl font-semibold">{project?.name}</h1>
            </div>
        </header>
    )
}

export default Header
