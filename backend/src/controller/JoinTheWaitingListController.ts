import { FastifyInstance } from "fastify"
import BrevoService from "../service/BrevoService"
import WaitingListDTO from "../types/WaitingListDTO"
import { verifyRecaptcha } from "../utils/recaptcha"
import AuthenticationMethod from "../types/AuthenticationMethod"

export function JoinTheWaitingListController(fastify: FastifyInstance) {
    const brevoService = new BrevoService()

    fastify.post<{ Body: WaitingListDTO }>("/waiting-list", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        // Validate reCAPTCHA token

        const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY
        if (!RECAPTCHA_SECRET_KEY) {
            throw new Error("RECAPTCHA_SECRET_KEY environment variable is not set")
        }
        const recaptchaSecretKey: string = RECAPTCHA_SECRET_KEY

        if (recaptchaSecretKey) {
            if (!req.body.recaptchaToken) {
                return res.status(400).send({
                    error: "reCAPTCHA token is required"
                })
            }

            const isRecaptchaValid = await verifyRecaptcha(req.body.recaptchaToken, recaptchaSecretKey)
            if (!isRecaptchaValid) {
                return res.status(400).send({
                    error: "Invalid reCAPTCHA token"
                })
            }
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(req.body.email)) {
            return res.status(400).send({
                error: "Please provide a valid email address"
            })
        }

        await brevoService.addToWaitingList(req.body)
        return res.send({ success: true })
    })
}

export default JoinTheWaitingListController
