import { ContactsApi } from "@getbrevo/brevo"
import WaitingListDTO from "../types/WaitingListDTO"

export class BrevoService {
    private apiInstance: ContactsApi | undefined
    private listId: number

    constructor() {
        const apiKey = process.env.BREVO_API_KEY
        this.listId = parseInt(process.env.BREVO_LIST_ID || "0", 10)

        if (!apiKey) {
            console.error("Brevo environment variables not set, will not init Brevo")
            return
        }

        this.apiInstance = new ContactsApi()
        const apiInstanceWithAuth = this.apiInstance as unknown as {
            authentications: { apiKey: { apiKey: string } }
        }
        apiInstanceWithAuth.authentications.apiKey.apiKey = apiKey
    }

    async addToWaitingList(data: WaitingListDTO): Promise<void> {
        if (!this.apiInstance) {
            console.error("BrevoService not initialized")
            return
        }
        await this.apiInstance.createContact({
            email: data.email,
            attributes: {
                ACCESS_PAGE: data.accessPage || "/",
                SELECTED_PLAN: data.selectedPlan || "free"
            },
            listIds: [this.listId],
            updateEnabled: true
        })
    }
}

export default BrevoService
