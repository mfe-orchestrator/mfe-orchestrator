import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import GlobalVariable, { IGlobalVariable } from "../models/GlobalVariableModel"
import GlobalVariableDTO from "../types/GlobalVariableDTO"
import BaseAuthorizedService from "./BaseAuthorizedService"
import Environment from "../models/EnvironmentModel"    
import GlobalVariableCreateDTO, { GlobalVariableUpdateDTO } from "../types/GlobalVariableCreateDTO"
import { DeleteResult } from "mongoose"


export default class GlobalVariablesService extends BaseAuthorizedService {

    async getAllByProjectId(projectId: string): Promise<IGlobalVariable[]> {
        await this.ensureAccessToProject(projectId)
        const environmentIds = (await Environment.find({ projectId }).select("_id")).map((env: any) => env._id)
        return GlobalVariable.find({ environmentId: { $in: environmentIds } }).sort({ key: 1 })
    }
    /**
     * Get all global variables for a specific environment
     * @param environmentId The ID of the environment
     * @returns Promise with array of global variables
     */
    async getAll(environmentId: string): Promise<IGlobalVariable[]> {
        await this.ensureAccessToEnvironment(environmentId)
        return GlobalVariable.find({ environmentId }).sort({ key: 1 })
    }

    async createForProject(variableData: GlobalVariableCreateDTO, projectId: string): Promise<IGlobalVariable[]> {
        await this.ensureAccessToProject(projectId)

        const environments = await Environment.find({ projectId }).select("_id")

        //Ensure that variable is unique for project
        const variable = await GlobalVariable.findOne({ key: variableData.key, environmentId: environments[0]._id });
        if(variable){
            throw new Error("Variable already exists for project")
        }

        const variables = environments.map(environment => {
            const foundVar = variableData.values.find(value => value.environmentId === environment._id.toString())
            if(!foundVar) {
                return
            }
            return new GlobalVariable({
                environmentId: environment._id,
                key: variableData.key,
                value: foundVar.value
            })
        }).filter(variable => variable)
        
        return GlobalVariable.insertMany(variables)
    }

    /**
     * Create a new global variable
     * @param variableData The variable data to create
     * @param environmentId The ID of the environment
     * @returns Promise with the created global variable
     */
    async create(variableData: GlobalVariableDTO, environmentId: string): Promise<IGlobalVariable> {
        await this.ensureAccessToEnvironment(environmentId)
        const variable = new GlobalVariable({
            ...variableData,
            environmentId
        })
        return variable.save()
    }

    /**
     * Update an existing global variable
     * @param id The ID of the variable to update
     * @param variableData The updated variable data
     * @param environmentId The ID of the environment (for validation)
     * @returns Promise with the updated global variable
     */
    async update(id: string, variableData: GlobalVariableDTO, environmentId: string): Promise<IGlobalVariable> {
        await this.ensureAccessToEnvironment(environmentId)
        const updatedVariable = await GlobalVariable.findOneAndUpdate({ _id: id, environmentId }, variableData, { new: true, runValidators: true })

        if (!updatedVariable) {
            throw new EntityNotFoundError(id)
        }

        return updatedVariable
    }

    async updateByProjectId(body: GlobalVariableUpdateDTO, projectId: string): Promise<(IGlobalVariable | null)[]> {
        await this.ensureAccessToProject(projectId)
        const envIds = (await Environment.find({ projectId }).select("_id")).map(env => env._id.toString())
        
        return Promise.all(body.values.filter(value => envIds.includes(value.environmentId)).map(value => {
            return GlobalVariable.findOneAndUpdate({ key: body.originalKey, environmentId: value.environmentId }, { key: body.key, value: value.value }, { new: true, runValidators: true })    
        }))
    }

    async deleteByProjectId(key : string, projectId: string): Promise<DeleteResult> {
        await this.ensureAccessToProject(projectId)
        const envIds = (await Environment.find({ projectId }).select("_id")).map((env: any) => env._id)

        return GlobalVariable.deleteMany({ key, environmentId: { $in: envIds } })
    }

    /**
     * Delete a global variable
     * @param id The ID of the variable to delete
     * @param environmentId The ID of the environment (for validation)
     * @returns Promise with the deleted global variable
     */
    async delete(id: string, environmentId: string): Promise<IGlobalVariable> {
        await this.ensureAccessToEnvironment(environmentId)
        const deletedVariable = await GlobalVariable.findOneAndDelete({
            _id: id,
            environmentId
        })

        if (!deletedVariable) {
            throw new EntityNotFoundError(id)
        }

        return deletedVariable
    }
}
