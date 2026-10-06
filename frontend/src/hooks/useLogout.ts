import { useAuth0 } from "@auth0/auth0-react"
import { useMsal } from "@azure/msal-react"
import { deleteToken } from "@/authentication/tokenUtils"
import useUserStore from "@/store/useUserStore"

/** Signs the user out of whichever provider they logged in with and clears the local session. */
const useLogout = () => {
    const { clearUser } = useUserStore()
    const msal = useMsal()
    const auth0 = useAuth0()

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

    return handleLogout
}

export default useLogout
