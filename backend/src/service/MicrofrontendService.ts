import { Model } from 'mongoose';
import Microfrontend, { IMicrofrontend } from '../models/MicrofrontendModel';

import MicrofrontendDTO from '../types/MicrofrontendDTO';
import EnvironmentService from './EnvironmentService';

export class MicrofrontendService {
  private environmentService: EnvironmentService;
  private microfrontendModel: Model<IMicrofrontend>;

  constructor(environmentService?: EnvironmentService) {
    this.microfrontendModel = Microfrontend;
    this.environmentService = environmentService || new EnvironmentService();
  }

  async create(microfrontend: MicrofrontendDTO, environment: string): Promise<IMicrofrontend> {
    return await this.microfrontendModel.create(microfrontend);
  }

  async getById(id: string): Promise<IMicrofrontend | null> {
    return await this.microfrontendModel.findById(id);
  }

  async getAll(): Promise<IMicrofrontend[]> {
    return await this.microfrontendModel.find();
  }

  async getByEnvironment(environment: string): Promise<IMicrofrontend[]> {
    return await this.microfrontendModel.find({ environment });
  }

  async update(id: string, updates: MicrofrontendDTO): Promise<IMicrofrontend | null> {
    const result = await this.microfrontendModel.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    );
    return result;
  }

  async delete(id: string): Promise<IMicrofrontend | null> {
    return await this.microfrontendModel.findByIdAndDelete(id);
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const result = await this.microfrontendModel.deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }

  async deploy(microfrontendId: string, environmentId: string): Promise<void> {
    // Check if microfrontend exists
    const microfrontend = await this.getById(microfrontendId);
    if (!microfrontend) {
      throw new Error('Microfrontend not found');
    }

    // Check if target environment exists
    const environment = await this.environmentService.getById(environmentId);
    if (!environment) {
      throw new Error('Target environment not found');
    }

    // Add deployment logic here
  }
}

export default new MicrofrontendService()
