import { useAuth0 } from "@auth0/auth0-react"
import { useMsal } from "@azure/msal-react"
import { useQueryClient } from "@tanstack/react-query"
import { deleteToken } from "@/authentication/tokenUtils"
import useAssistantJobsStore from "@/store/useAssistantJobsStore"
import useAssistantStore from "@/store/useAssistantStore"
import useUserStore from "@/store/useUserStore"

/** Signs the user out of whichever provider they logged in with and clears the local session. */
const useLogout = () => {
    const { clearUser } = useUserStore()
    const msal = useMsal()
    const auth0 = useAuth0()
    const queryClient = useQueryClient()

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
            // Not awaited: it leaves the page for Microsoft, and the local session below has to be cleared first
            if (msal?.accounts?.length) {
                msal.instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin }).catch(error => console.error("Error during Microsoft logout:", error))
            }
        } catch (error) {
            console.error("Error during logout:", error)
        } finally {
            clearUser()
            // The conversations and the job tabs are kept in the browser: the next person signing in here must not see them.
            useAssistantStore.getState().clearAll()
            useAssistantJobsStore.getState().clearAll()
            // The history lists the previous user's questions: it must not show from the cache.
            queryClient.removeQueries({ queryKey: ["assistant-conversations"] })
        }
    }

    return handleLogout
}

export default useLogout
