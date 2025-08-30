import { Button } from "@/components/ui/button/button"
import { useAuth0 } from "@auth0/auth0-react"
import { deleteToken } from "../tokenUtils"
import { LoginComponentProps } from "./LoginPage"

const LoginWithAuth0Button: React.FC<LoginComponentProps> = ({ onSuccessLogin }) => {
    const auth = useAuth0()

    const handleAuth0Login = async () => {
        await auth.loginWithPopup()
        deleteToken()
        onSuccessLogin?.()
    }

    return (
        <Button variant="secondary" type="button" className="flex flex-1" onClick={handleAuth0Login}>
            Auth0
        </Button>
    )
}

export default LoginWithAuth0Button
