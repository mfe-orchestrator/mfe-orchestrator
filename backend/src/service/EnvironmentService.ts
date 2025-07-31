import { EntityNotFoundError } from '../errors/EntityNotFoundError';
import Environment from '../models/EnvironmentModel';
import { EnvironmentDTO } from '../types/EnvironmentDTO';
import BaseAuthorizedService from './BaseAuthorizedService';

class EnvironmentService extends BaseAuthorizedService{
  
  async getByProjectId(projectId: string) {
    await this.ensureAccessToProject(projectId);
    return Environment.find({ projectId }).sort({ name: 1 });
  }
  
  async getById(id: string) {
    await this.ensureAccessToEnvironment(id);
    return await Environment.findOne({ _id: id });
  }

  async create(environmentData: EnvironmentDTO, projectId: string) {
    await this.ensureAccessToProject(projectId);
    const environment = new Environment(environmentData);
    environment.projectId = projectId;
    return await environment.save();
  }

  async update(environmentId: string, updateData: EnvironmentDTO) {
    await this.ensureAccessToEnvironment(environmentId);
    const updatedEnvironment = await Environment.findOneAndUpdate(
        { _id: environmentId },
        updateData,
        { new: true }
      );

      if (!updatedEnvironment) {
        throw new EntityNotFoundError(environmentId);
      }

      return updatedEnvironment;
  }

  async deleteSingle(environmentId: string) {
    await this.ensureAccessToEnvironment(environmentId);
    const deletedEnvironment = await Environment.findOneAndDelete({ _id: environmentId });
    if (!deletedEnvironment) {
        throw new EntityNotFoundError(environmentId);
    }
  }

  // Delete multiple environments
  async deleteMultiple(ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('Ids array is required');
    }
    for(const environmentId of ids){
      await this.ensureAccessToEnvironment(environmentId);
    }

    return await Environment.deleteMany({ _id: { $in: ids } });
  }
}

export default EnvironmentService;