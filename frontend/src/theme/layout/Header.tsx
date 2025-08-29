import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Settings, LogOut, User, Github } from "lucide-react"
import LanguageSelector from "../../components/LanguageSelector"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import useUserStore from "@/store/useUserStore"
import useThemeStore from "@/store/useThemeStore"
import ThemeToggle from "../../components/ThemeToggle"
import { useMsal } from "@azure/msal-react"
import { useAuth0 } from "@auth0/auth0-react"
import { deleteToken, getToken } from "@/authentication/tokenUtils"
import { useEffect, useMemo, useState } from "react"
import { AccountInfo } from "@azure/msal-browser"
import CryptoJS from "crypto-js"
import useProjectStore from "@/store/useProjectStore"
import SwitchProjectButton from "@/components/SwitchProjectButton"

const Header: React.FC = () => {
    const { title, icon } = useThemeStore()
    const { project } = useProjectStore()
    const { user, clearUser } = useUserStore()
    const { t } = useTranslation()
    const msal = useMsal()
    const auth0 = useAuth0()

    const getActiveMsalAccount = (): AccountInfo | undefined => {
        if (!msal || !msal.instance) return undefined
        const active = msal.instance.getActiveAccount()
        if (active) return active
        const all = msal.instance.getAllAccounts()
        if (all.length > 0) return all[0]
        return undefined
    }

    const getNameAndSurname = async () => {
        if (user?.firstName || user?.lastName) {
            return `${user.firstName} ${user.lastName}`
        }

        if (auth0.user) {
            return auth0.user.given_name + " " + auth0.user.family_name
        }

        const googleData = localStorage.getItem("googleData")
        if (googleData) {
            const { name } = JSON.parse(googleData)
            return name
        }

        if (msal.instance) {
            const account = await getActiveMsalAccount()
            if (account) return account.name || account.username
        }

        return user?.email
    }

    const getProfilePictureUrl = () => {
        // Check Auth0 profile picture
        if (auth0.user?.picture) {
            return auth0.user.picture
        }

        // Check Google profile picture
        const googleData = localStorage.getItem("googleData")
        if (googleData) {
            try {
                const { picture } = JSON.parse(googleData)
                if (picture) return picture
            } catch (e) {
                console.error("Error parsing Google data:", e)
            }
        }

        // Check MSAL account picture (if needed)
        /*if (msal.instance) {
      const account = getActiveMsalAccount();
      if(account?.picture) return account.picture;
    }*/

        // Fallback to Gravatar using the user's email
        if (user?.email) {
            const email = user.email.trim().toLowerCase()
            const hash = CryptoJS.MD5(email).toString()
            return `https://www.gravatar.com/avatar/${hash}?s=200&d=mp` // mp = mystery person as default
        }

        // Return null if no picture is available
        return null
    }

    const handleLogout = async () => {
        try {
            // Clear tokens from localStorage
            deleteToken()

            // Logout from Auth0 if logged in with Auth0
            if (auth0.user) {
                auth0.logout()
                return
            }

            const googleData = localStorage.getItem("googleData")
            if (googleData) {
                localStorage.removeItem("googleData")
                try {
                    const { access_token } = JSON.parse(googleData)
                    if (access_token) {
                        // Revoke the Google access token
                        await fetch("https://oauth2.googleapis.com/revoke?token=" + access_token, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/x-www-form-urlencoded"
                            }
                        })
                    }
                } catch (error) {
                    console.error("Error revoking Google token:", error)
                }

                return
            }
            // Logout from Microsoft if logged in with Microsoft
            if (msal?.instance) {
                await msal.instance.logout()
            }
        } catch (error) {
            console.error("Error during logout:", error)
        } finally {
            clearUser()
        }
    }

    const { nameAndSurname, profilePictureUrl } = useMemo(() => {
        return {
            nameAndSurname: getNameAndSurname(),
            profilePictureUrl: getProfilePictureUrl()
        }
    }, [user, auth0.user, msal.instance])

    return (
        <header className="bg-background border-b border-border h-16 flex items-center justify-between px-6">
            <div className="flex flex-row gap-2 items-center">
                <SwitchProjectButton />
                <h1 className="text-xl font-semibold">{project?.name}</h1>
            </div>

            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                    <a
                        href="https://github.com/Lory1990/micro-frontend-orchestrator-hub"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        aria-label="GitHub repository"
                    >
                        <Github className="h-5 w-5" />
                    </a>
                    <LanguageSelector />
                    <ThemeToggle />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" className="relative flex items-center gap-2">
                            {profilePictureUrl ? (
                                <img
                                    src={profilePictureUrl}
                                    alt="Profile"
                                    className="h-6 w-6 rounded-full"
                                    onError={e => {
                                        // Fallback to user icon if image fails to load
                                        const target = e.target as HTMLImageElement
                                        target.src = ""
                                        target.className = "h-4 w-4"
                                        target.nextElementSibling?.classList.remove("hidden")
                                    }}
                                />
                            ) : (
                                <User className="h-4 w-4" />
                            )}
                            <span className="truncate max-w-[120px]">{nameAndSurname}</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                        <DropdownMenuLabel>{t("settings.account")}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>{t("auth.logout")}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}

export default Header
