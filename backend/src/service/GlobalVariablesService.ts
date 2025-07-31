import { EntityNotFoundError } from '../errors/EntityNotFoundError';
import GlobalVariable from '../models/GlobalVariableModel';
import GlobalVariableDTO from '../types/GlobalVariableDTO';
import BaseAuthorizedService from './BaseAuthorizedService';

export default class GlobalVariablesService extends BaseAuthorizedService {
  /**
   * Get all global variables for a specific environment
   * @param environmentId The ID of the environment
   * @returns Promise with array of global variables
   */
  async getAll(environmentId: string) {
    await this.ensureAccessToEnvironment(environmentId);
    return GlobalVariable.find({ environmentId }).sort({ key: 1 });
  }

  /**
   * Create a new global variable
   * @param variableData The variable data to create
   * @param environmentId The ID of the environment
   * @returns Promise with the created global variable
   */
  async create(variableData: GlobalVariableDTO, environmentId: string) {
    await this.ensureAccessToEnvironment(environmentId)
    const variable = new GlobalVariable({
      ...variableData,
      environmentId,
    });
    return variable.save();
  }

  /**
   * Update an existing global variable
   * @param id The ID of the variable to update
   * @param variableData The updated variable data
   * @param environmentId The ID of the environment (for validation)
   * @returns Promise with the updated global variable
   */
  async update(id: string, variableData: GlobalVariableDTO, environmentId: string) {
    await this.ensureAccessToEnvironment(environmentId)
    const updatedVariable = await GlobalVariable.findOneAndUpdate(
      { _id: id, environmentId },
      variableData,
      { new: true, runValidators: true }
    );

    if (!updatedVariable) {
      throw new EntityNotFoundError(id);
    }

    return updatedVariable;
  }

  /**
   * Delete a global variable
   * @param id The ID of the variable to delete
   * @param environmentId The ID of the environment (for validation)
   * @returns Promise with the deleted global variable
   */
  async delete(id: string, environmentId: string) {
    await this.ensureAccessToEnvironment(environmentId)
    const deletedVariable = await GlobalVariable.findOneAndDelete({
      _id: id,
      environmentId,
    });

    if (!deletedVariable) {
      throw new EntityNotFoundError(id);
    }

    return deletedVariable;
  }
}
