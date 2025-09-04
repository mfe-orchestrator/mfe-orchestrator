import { deleteToken } from "@/authentication/tokenUtils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import useUserStore from "@/store/useUserStore"
import { useAuth0 } from "@auth0/auth0-react"
import { AccountInfo } from "@azure/msal-browser"
import { useMsal } from "@azure/msal-react"
import CryptoJS from "crypto-js"
import { LogOut, User } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavItem, NavItemProps } from "./NavItem/NavItem"

export const UserButton: React.FC<NavItemProps> = ({ isSidebarCollapsed, disabled }) => {
    const { user, clearUser } = useUserStore()
    const { t } = useTranslation()
    const msal = useMsal()
    const auth0 = useAuth0()
    const [nameAndSurname, setNameAndSurname] = useState<string>()
    const [profilePictureUrl, setProfilePictureUrl] = useState<string>()

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
            const account = getActiveMsalAccount()
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

    useEffect(() => {
        getNameAndSurname().then(res => setNameAndSurname(res))
        setProfilePictureUrl(getProfilePictureUrl())
    }, [user, auth0.user, msal.instance])

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
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t("auth.logout")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
