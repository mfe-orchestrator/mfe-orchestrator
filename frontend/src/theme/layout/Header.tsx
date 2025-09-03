import SwitchProjectButton from "@/components/SwitchProjectButton"
import useProjectStore from "@/store/useProjectStore"

const Header: React.FC = () => {
    const { project } = useProjectStore()

    return (
        <header className="bg-background border-b border-divider flex items-center justify-between px-1 mx-2 pt-2 pb-4">
            <h1 className="text-lg font-semibold text-foreground-secondary">{project?.name}</h1>
            <SwitchProjectButton />
        </header>
    )
}

export default Header
