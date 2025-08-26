import mongoose from "mongoose"
import { isReplicaSet } from "../plugins/noSQL"

export async function runInTransaction<T>(fn: (session?: mongoose.ClientSession) => Promise<T>): Promise<T> {
    if (!isReplicaSet) {
        return fn()
    }
    const session = await mongoose.startSession()
    try {
        let result: T
        await session.withTransaction(async () => {
            result = await fn(session)
        })
        return result!
    } catch (err) {
        throw err
    } finally {
        session.endSession()
    }
}
