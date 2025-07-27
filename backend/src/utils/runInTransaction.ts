import mongoose from 'mongoose';

export async function runInTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } catch (err) {
    throw err;
  } finally {
    session.endSession();
  }
}
