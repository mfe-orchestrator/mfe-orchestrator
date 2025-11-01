import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/utils/styleUtils"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

interface AddNewMicrofrontendCardProps {
    onAddNewMicrofrontend: (parentId?: string) => void
    className?: string
}

const AddNewMicrofrontendCard: React.FC<AddNewMicrofrontendCardProps> = ({ onAddNewMicrofrontend, className }) => {
    const { t } = useTranslation("platform")

    return (
        <Card
            className={cn(
                "h-full flex flex-col transition-all duration-200 cursor-pointer",
                "border-2 border-dashed border-border/50 hover:border-primary",
                "hover:shadow-lg hover:scale-[1.01]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className
            )}
            onClick={onAddNewMicrofrontend}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onAddNewMicrofrontend()
                }
            }}
        >
            <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="p-2 mb-4 rounded-sm bg-primary/15">
                    <Plus className="w-8 h-8 text-primary/75" />
                </div>
                <h3 className="text-lg font-semibold mb-0">{t("microfrontend.add_new")}</h3>
                <p className="text-foreground-secondary">{t("microfrontend.click_to_create")}</p>
            </CardContent>
        </Card>
    )
}

export default AddNewMicrofrontendCard
