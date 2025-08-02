import { EntityNotFoundError } from '../errors/EntityNotFoundError';
import Environment from '../models/EnvironmentModel';
import GlobalVariable from '../models/GlobalVariableModel';
import Microfrontend from '../models/MicrofrontendModel';
import { EnvironmentDTO } from '../types/EnvironmentDTO';
import { runInTransaction } from '../utils/runInTransaction';
import BaseAuthorizedService from './BaseAuthorizedService';
import { ClientSession, ObjectId, Types } from 'mongoose';

class EnvironmentService extends BaseAuthorizedService {

  async getByProjectId(projectId: string) {
    await this.ensureAccessToProject(projectId);
    const projectIdObj = typeof projectId === 'string' ? new Types.ObjectId(projectId) : projectId;
    return Environment.find({ projectId: projectIdObj }).sort({ name: 1 });
  }

  async getById(id: string | ObjectId, session?: ClientSession) {
    await this.ensureAccessToEnvironment(id, session);
    const idObj = typeof id === 'string' ? new Types.ObjectId(id) : id;
    return await Environment.findOne({ _id: idObj }).session(session ?? null);
  }

  async create(environmentData: EnvironmentDTO, projectId: string) {
    const projectIdObj = typeof projectId === 'string' ? new Types.ObjectId(projectId) : projectId;
    await this.ensureAccessToProject(projectIdObj);
    const environment = new Environment(environmentData);
    environment.projectId = projectIdObj;
    return await environment.save();
  }

  async createBulk(body: EnvironmentDTO[], projectId: string) {
    const projectIdObj = typeof projectId === 'string' ? new Types.ObjectId(projectId) : projectId;
    await this.ensureAccessToProject(projectIdObj);
    const environments = body.map(env => new Environment(env));
    environments.forEach(env => env.projectId = projectIdObj);
    return await Environment.insertMany(environments);
  }

  async update(environmentId: string | ObjectId, updateData: EnvironmentDTO) {
    await this.ensureAccessToEnvironment(environmentId);
    const environmentIdObj = typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId;
    const updatedEnvironment = await Environment.findOneAndUpdate(
      { _id: environmentIdObj },
      updateData,
      { new: true }
    );

    if (!updatedEnvironment) {
      throw new EntityNotFoundError(environmentIdObj.toString());
    }

    return updatedEnvironment;
  }

  async deleteSingle(environmentId: string | ObjectId) {
    await this.ensureAccessToEnvironment(environmentId);
    const environmentIdObj = typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId;
    const deletedEnvironment = await Environment.findOneAndDelete({ _id: environmentIdObj });
    if (!deletedEnvironment) {
      throw new EntityNotFoundError(environmentIdObj.toString());
    }
  }

  // Delete multiple environments
  async deleteMultiple(ids: (string | ObjectId)[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error('Ids array is required');
    }

    const idsObj = await Promise.all(ids.map(async id => {
      await this.ensureAccessToEnvironment(id);
      return typeof id === 'string' ? new Types.ObjectId(id) : id
    }));

    return await Environment.deleteMany({ _id: { $in: idsObj } });
  }

  async deploy(environmentId: string | ObjectId, environmentIds: (string | ObjectId)[]) {
    return runInTransaction(async (session) => this.deployRaw(environmentId, environmentIds, session))
  }

  async deployRaw(environmentId: string | ObjectId, environmentIds: (string | ObjectId)[], session?: ClientSession) {
    // Check if microfrontend exists
    const environmentIdObj = typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId;

    // can i access to this environment?
    await this.ensureAccessToEnvironment(environmentId, session);

    // can i access to target environment?
    const environmentIdsObj = await Promise.all(environmentIds.map(async environmentId => {
      await this.ensureAccessToEnvironment(environmentId, session);
      return typeof environmentId === 'string' ? new Types.ObjectId(environmentId) : environmentId
    }));

    // Deploy 
    const microfrontendsToDeploy = await Microfrontend.find({ environmentId: environmentIdObj }, { session });
    const globalVariablesToDeploy = await GlobalVariable.find({ environmentId: environmentIdObj }, { session });
    for (const environmentId of environmentIdsObj) {
      await Microfrontend.deleteMany({ environmentId }, { session })
      await GlobalVariable.deleteMany({ environmentId }, { session })
      for (const microfrontend of microfrontendsToDeploy) {
        await Microfrontend.create({ ...microfrontend, environmentId }, { session })
      }

      for (const globalVariable of globalVariablesToDeploy) {
        await GlobalVariable.create({ ...globalVariable, environmentId }, { session })
      }
    }
  }
}

export default EnvironmentService;