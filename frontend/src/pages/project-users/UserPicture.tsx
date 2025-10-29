import Spinner from "@/components/Spinner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import Gravatar from "react-gravatar"

const gravatarHash = async (email: string) => {
    if (typeof email !== "string") {
        throw new TypeError("email must be a string")
    }

    // 1) Trim whitespace and 2) lowercase
    const normalized = email.trim().toLowerCase()

    // 3) SHA-256 hash using Web Crypto
    const encoder = new TextEncoder()
    const data = encoder.encode(normalized)
    const digest = await crypto.subtle.digest("SHA-256", data)

    // Convert ArrayBuffer to hex string
    const bytes = new Uint8Array(digest)
    const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")

    return hex
}

export const UserPicture: React.FC<{ userEmail: string; userInitials: string }> = ({ userEmail, userInitials }) => {
    const gravatarQuery = useQuery({
        queryKey: ["gravatar", userEmail],
        queryFn: async () => {
            const hash = await gravatarHash(userEmail)
            return axios.get(`https://www.gravatar.com/avatar/${hash}.json?d=404`)
        },
        enabled: !!userEmail,
        retry: false
    })

    return (
        <Avatar className="h-20 w-20">
            {gravatarQuery.isLoading || gravatarQuery.isError ? (
                <AvatarFallback>{userInitials}</AvatarFallback>
            ) : (
                <Gravatar email={userEmail} size={160} className="rounded-full w-full" default="mp" />
            )}
        </Avatar>
    )
}
