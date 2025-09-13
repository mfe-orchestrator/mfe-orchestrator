import { Types } from "mongoose"
import Market, { IMarket } from "../models/MarketModel"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import BaseAuthorizedService from "./BaseAuthorizedService"

export class MarketService extends BaseAuthorizedService {

    async getAll(): Promise<IMarket[]> {
        try {
            return await Market.find().sort({ name: 1 }).lean()
        } catch (error) {
            throw createBusinessException({
                code: "MARKET_FETCH_ERROR",
                message: "Failed to fetch markets",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async getSingle(id: string): Promise<IMarket | null> {
        try {
            if (!Types.ObjectId.isValid(id)) {
                throw createBusinessException({
                    code: "INVALID_ID",
                    message: "Invalid market ID format",
                    statusCode: 400
                })
            }

            return await Market.findById(id).lean()
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "MARKET_FETCH_ERROR",
                message: "Failed to fetch market",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }
}

export default MarketService