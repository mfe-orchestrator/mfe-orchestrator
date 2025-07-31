import { Model } from 'mongoose';
import Microfrontend, { IMicrofrontend } from '../models/MicrofrontendModel';

import MicrofrontendDTO from '../types/MicrofrontendDTO';
import BaseAuthorizedService from './BaseAuthorizedService';

export class MicrofrontendService extends BaseAuthorizedService {

  async create(microfrontend: MicrofrontendDTO, environment: string): Promise<IMicrofrontend> {
    await this.ensureAccessToEnvironment(environment);
    return await Microfrontend.create(microfrontend);
  }

  async getById(id: string): Promise<IMicrofrontend | null> {
    return await Microfrontend.findById(id);
  }

  async getAll(): Promise<IMicrofrontend[]> {
    return await Microfrontend.find();
  }

  async getByEnvironment(environment: string): Promise<IMicrofrontend[]> {
    return await Microfrontend.find({ environment });
  }

  async update(id: string, updates: MicrofrontendDTO): Promise<IMicrofrontend | null> {
    const result = await Microfrontend.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    );
    return result;
  }

  async delete(id: string): Promise<IMicrofrontend | null> {
    return await Microfrontend.findByIdAndDelete(id);
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const result = await Microfrontend.deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }

  async deploy(microfrontendId: string, environmentId: string): Promise<void> {
    // Check if microfrontend exists
    const microfrontend = await this.getById(microfrontendId);
    if (!microfrontend) {
      throw new Error('Microfrontend not found');
    }

    // Check if target environment exists
    const environment = await this.ensureAccessToEnvironment(environmentId);
    /*if (!environment) {
      throw new Error('Target environment not found');
    }*/

    // Add deployment logic here
  }
}

export default MicrofrontendService
