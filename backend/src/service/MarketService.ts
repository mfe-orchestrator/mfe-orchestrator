import Market, { IMarket } from "../models/MarketModel"
import BaseAuthorizedService from "./BaseAuthorizedService"

export class MarketService extends BaseAuthorizedService {

    async getAll(): Promise<IMarket[]> {
        const data =  await Market.find().sort({ name: 1 }).lean()
        const seededData = await this.seed()
        return [...data, ...seededData];
    }

    async getSingle(id: string): Promise<IMarket | null> {
        return await Market.findById(id).lean()
    }

    async seed() {
        const response = await fetch('https://raw.githubusercontent.com/mfe-orchestrator-hub/documentation/refs/heads/main/marketplace/marketplace.json')
        const data = await response.json()
        return data;
    }
}

export default MarketService