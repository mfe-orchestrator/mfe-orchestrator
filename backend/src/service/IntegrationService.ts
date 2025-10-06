import { ObjectId } from "mongoose"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { MicrofrontendService } from "./MicrofrontendService"

export interface IIntegrationData {
    slug: string
    url?: string
    version: string
    type: string
}

export default class IntegrationService extends BaseAuthorizedService {

    async injectMicrofrontendHostData(microfrontendId: string | ObjectId){
        const microfrontendService = new MicrofrontendService(this.getUser())
        const microfrontend = await microfrontendService.getById(microfrontendId)
        
    }
    async getIntegrationDataByMicrofrontendId(microfrontendId: string | ObjectId) {
        const microfrontendService = new MicrofrontendService(this.getUser())
        const microfrontend = await microfrontendService.getById(microfrontendId)

        if (!microfrontend) {
            throw new Error("No microfrontend found")
        }

        const integrationData: IIntegrationData = {
            slug: microfrontend.slug,
            url: microfrontend.host?.url,
            version: microfrontend.version,
            type: microfrontend.type
        }

        return {
            microfrontend,
            integrationData
        }
    }
}
