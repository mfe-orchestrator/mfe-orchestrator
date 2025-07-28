import { EntityNotFoundError } from '../errors/EntityNotFoundError';
import Environment from '../models/EnvironmentModel';
import { EnvironmentDTO } from '../types/EnvironmentDTO';

class EnvironmentService {
  
  getByProjectId(projectId: string) {
    return Environment.find({ projectId }).sort({ name: 1 });
  }

  getAll() {
    return Environment.find().sort({ name: 1 });
  }

  async getBySlug(slug: string) {
    const environment = await Environment.findOne({ slug });
    if (!environment) {
      throw new EntityNotFoundError(slug);
    }
    return environment;
  }

  async getById(id: string) {
    const environment = await Environment.findOne({ id });
    if (!environment) {
      throw new EntityNotFoundError(id);
    }
    return environment;
  }

  async create(environmentData: EnvironmentDTO) {
    const environment = new Environment(environmentData);
    return await environment.save();
  }

  async update(id: string, updateData: EnvironmentDTO) {
    const updatedEnvironment = await Environment.findOneAndUpdate(
        { id },
        updateData,
        { new: true }
      );

      if (!updatedEnvironment) {
        throw new EntityNotFoundError(id);
      }

      return updatedEnvironment;
  }

  async deleteSingle(id: string) {
    const deletedEnvironment = await Environment.findOneAndDelete({ id });
    if (!deletedEnvironment) {
        throw new EntityNotFoundError(id);
    }
  }

  // Delete multiple environments
  async deleteMultiple(ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('Ids array is required');
    }

    return await Environment.deleteMany({ id: { $in: ids } });
  }
}

export default EnvironmentService;