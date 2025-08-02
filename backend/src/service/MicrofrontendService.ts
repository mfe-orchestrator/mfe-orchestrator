import { ClientSession, ObjectId, Types } from 'mongoose';
import Microfrontend, { IMicrofrontend } from '../models/MicrofrontendModel';

import MicrofrontendDTO from '../types/MicrofrontendDTO';
import BaseAuthorizedService from './BaseAuthorizedService';
import { EntityNotFoundError } from '../errors/EntityNotFoundError';
import { runInTransaction } from '../utils/runInTransaction';

export class MicrofrontendService extends BaseAuthorizedService {

  async getById(id: string | ObjectId, session?: ClientSession): Promise<IMicrofrontend | null> {
    const idObj = typeof id === 'string' ? new Types.ObjectId(id) : id;
    const microfrontend = await Microfrontend.findById(idObj, { session });
    if(!microfrontend){
      return null;
    }
    this.ensureAccessToMicrofrontend(microfrontend);
    return microfrontend;
  }

  async getByEnvironmentId(environmentId: string | ObjectId): Promise<IMicrofrontend[]> {
    await this.ensureAccessToEnvironment(environmentId);
    const environmentIdObj = typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId;
    return await Microfrontend.find({ environmentId: environmentIdObj });
  }

  async create(microfrontend: MicrofrontendDTO, environmentId: string | ObjectId): Promise<IMicrofrontend> {
    await this.ensureAccessToEnvironment(environmentId);
    const environmentIdObj = typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId;
    return await Microfrontend.create({ ...microfrontend, environmentId: environmentIdObj });
  }

  async update(microfrontendId: string | ObjectId, updates: MicrofrontendDTO): Promise<IMicrofrontend | null> {
    const microfrontendIdObj = typeof microfrontendId === 'string' ? new Types.ObjectId(microfrontendId) : microfrontendId;
    const microfrontend = await this.getById(microfrontendId);
    if(!microfrontend){
      throw new EntityNotFoundError(microfrontendIdObj.toString());
    }
    await this.ensureAccessToMicrofrontend(microfrontend);

    
    const result = await Microfrontend.findByIdAndUpdate(
      microfrontendIdObj,
      updates,
      { new: true }
    );
    return result;
  }

  async delete(microfrontendId: string | ObjectId): Promise<IMicrofrontend | null> {
    const microfrontendIdObj = typeof microfrontendId === 'string' ? new Types.ObjectId(microfrontendId) : microfrontendId;
    const microfrontend = await this.getById(microfrontendId);
    if(!microfrontend){
      throw new EntityNotFoundError(microfrontendIdObj.toString());
    }
    await this.ensureAccessToMicrofrontend(microfrontend);
    return await Microfrontend.findByIdAndDelete(microfrontendIdObj);
  }

  async bulkDelete(ids: string[]): Promise<number> {
    for(const id of ids){
      const microfrontend = await this.getById(id);
      if(!microfrontend){
        throw new EntityNotFoundError(id);
      }
      await this.ensureAccessToMicrofrontend(microfrontend);
    }

    const result = await Microfrontend.deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }

  async deploySingle(microfrontendId: string | ObjectId, targetEnvironmentIds: (string | ObjectId)[]): Promise<void> {
    return runInTransaction(async (session) =>  this.deploySingleRaw(microfrontendId, targetEnvironmentIds, session))    
  }

  async deploySingleRaw(microfrontendId: string | ObjectId, targetEnvironmentIds: (string | ObjectId)[], session?: ClientSession): Promise<void> {
    // Check if microfrontend exists
    const microfrontend = await this.getById(microfrontendId, session);
    if (!microfrontend) {
      throw new EntityNotFoundError(microfrontendId.toString())
    }
    // can i access to this microfrontend?
    await this.ensureAccessToMicrofrontend(microfrontend);

    // Check if target environment exists
    const targetEnvironmentsObj = await Promise.all(targetEnvironmentIds.map(async targetEnvironment =>{
      const targetEnvironmentObjId = typeof targetEnvironment === 'string' ? new Types.ObjectId(targetEnvironment) : targetEnvironment 
      await this.ensureAccessToEnvironment(targetEnvironment, session);
      return targetEnvironmentObjId
    }));

    // deploy microfrontend
    const slugToFind = microfrontend.slug;

    await Microfrontend.deleteMany({ slug: slugToFind, environmentId: { $in: targetEnvironmentsObj } , session});

    await Promise.all(targetEnvironmentIds.map(async targetEnvironmentId => Microfrontend.create({ ...microfrontend, environmentId: targetEnvironmentId }, { session })))
    
  }

  ensureAccessToMicrofrontend(microfrontend : IMicrofrontend){
    return this.ensureAccessToEnvironment(microfrontend.environmentId);
  }
}

export default MicrofrontendService
