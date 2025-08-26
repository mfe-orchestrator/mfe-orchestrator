interface RecaptchaResponse {
    success: boolean
    challenge_ts?: string
    hostname?: string
    "error-codes"?: string[]
}

export async function verifyRecaptcha(token: string, secretKey: string): Promise<boolean> {
    try {
        const response = await fetch("https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + token, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        })

        const data: RecaptchaResponse = await response.json()
        return data.success === true
    } catch (error) {
        console.error("Error verifying reCAPTCHA:", error)
        return false
    }
}
