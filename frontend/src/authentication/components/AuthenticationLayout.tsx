import { ReactNode } from "react"
import MainLogo from "@/components/MainLogo"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import LanguageSelector from "@/components/ui/Sidebar/partials/LanguageSelector"
import ThemeToggle from "@/components/ui/Sidebar/partials/ThemeToggle"
import { cn } from "@/utils/styleUtils"

interface AuthenticationLayoutProps {
    title: string | ReactNode
    description?: string | ReactNode
    children: ReactNode
    footer?: ReactNode
    /** `lg` widens the card for content that needs more room than a form, such as a grid of tiles. */
    size?: "default" | "lg"
}

const sizeClasses = {
    default: "max-w-md",
    lg: "max-w-2xl"
} as const

const AuthenticationLayout: React.FC<AuthenticationLayoutProps> = ({ title, description, children, footer, size = "default" }) => {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted">
            <div className="absolute top-4 right-4 flex items-center space-x-2">
                <LanguageSelector purpose="page" />
                <ThemeToggle purpose="page" />
            </div>
            <div className={cn("w-full", sizeClasses[size])}>
                <div className="flex justify-center mb-6">
                    <MainLogo />
                </div>

                <Card className="py-5">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center mb-0">{title}</CardTitle>
                        {description && <CardDescription className="text-base text-center">{description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="py-3">{children}</CardContent>
                    {footer && <CardFooter className="flex justify-center">{footer}</CardFooter>}
                </Card>
            </div>
        </div>
    )
}

export default AuthenticationLayout
