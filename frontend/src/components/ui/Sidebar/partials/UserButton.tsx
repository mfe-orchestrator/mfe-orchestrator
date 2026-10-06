import { useAuth0 } from "@auth0/auth0-react"
import { AccountInfo } from "@azure/msal-browser"
import { useMsal } from "@azure/msal-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, NavItem, NavItemProps } from "@mfe-orchestrator/design-system"
import { LogOut, User, UserCog } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import useLogout from "@/hooks/useLogout"
import useProfilePicture from "@/hooks/useProfilePicture"
import useUserStore from "@/store/useUserStore"

export const UserButton: React.FC<NavItemProps> = ({ isSidebarCollapsed, disabled }) => {
    const { user } = useUserStore()
    const handleLogout = useLogout()
    const { t } = useTranslation()
    const msal = useMsal()
    const auth0 = useAuth0()
    const navigate = useNavigate()
    const uploadedPicture = useProfilePicture()
    const [nameAndSurname, setNameAndSurname] = useState<string>()
    const [profilePictureUrl, setProfilePictureUrl] = useState<string>()

    const getActiveMsalAccount = React.useCallback((): AccountInfo | undefined => {
        if (!msal || !msal.instance) return undefined
        const active = msal.instance.getActiveAccount()
        if (active) return active
        const all = msal.instance.getAllAccounts()
        if (all.length > 0) return all[0]
        return undefined
    }, [msal])

    const getNameAndSurname = React.useCallback(async () => {
        const fullName = [user?.name, user?.surname].filter(Boolean).join(" ")
        if (fullName) {
            return fullName
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
            const account = getActiveMsalAccount()
            if (account) return account.name || account.username
        }

        return user?.email
    }, [user, auth0.user, msal.instance, getActiveMsalAccount])

    const getProfilePictureUrl = React.useCallback(async () => {
        // L'immagine caricata dalla pagina profilo vince su tutto: è la sola che
        // l'utente ha scelto esplicitamente su questa piattaforma, le altre sono
        // ereditate dal provider di login o dedotte dall'email.
        if (uploadedPicture.data) {
            return uploadedPicture.data
        }

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

        // Fallback to Gravatar using the user's email
        if (user?.email) {
            const email = user.email.trim().toLowerCase()
            const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email))
            const hash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, "0"))
                .join("")
            return `https://www.gravatar.com/avatar/${hash}?s=200&d=mp` // mp = mystery person as default
        }

        // Return null if no picture is available
        return null
    }, [user, auth0.user, uploadedPicture.data])

    useEffect(() => {
        getNameAndSurname().then(res => setNameAndSurname(res))
        getProfilePictureUrl().then(res => setProfilePictureUrl(res ?? undefined))
    }, [getNameAndSurname, getProfilePictureUrl])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <NavItem
                    type="secondary"
                    icon={profilePictureUrl ? <img src={profilePictureUrl} alt="Profile" className="rounded-full h-8 w-8 border-2 border-border" /> : <User />}
                    name={nameAndSurname || ""}
                    isSidebarCollapsed={isSidebarCollapsed}
                    disabled={disabled}
                    className="px-3"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" side="right" sideOffset={0}>
                <DropdownMenuLabel>{t("settings.account")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <UserCog className="mr-2 h-4 w-4" />
                    <span>{t("profile.title")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t("auth.logout")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
