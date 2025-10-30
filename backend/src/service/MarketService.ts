import Market, { IMarket } from "../models/MarketModel";
import BaseAuthorizedService from "./BaseAuthorizedService";

export class MarketService extends BaseAuthorizedService {
  async getAll(): Promise<IMarket[]> {
    const data = await Market.find().sort({ name: 1 });
    const seededData = await this.seed();
    return [...data, ...seededData];
  }

  async getSingle(slug: string): Promise<IMarket | null> {
    const seededData = await this.seed();
    return seededData.find((m) => m.slug === slug) || Market.findOne({ slug });
  }

  async seed(): Promise<IMarket[]> {
    const response = await fetch(
      "https://raw.githubusercontent.com/mfe-orchestrator/documentation/refs/heads/main/marketplace/marketplace.json"
    );
    const data = await response.json();
    return data;
  }
}

export default MarketService;
