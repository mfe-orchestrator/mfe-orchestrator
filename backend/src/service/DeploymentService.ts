import Deployment from "../models/Deployments";
import BaseAuthorizedService from "./BaseAuthorizedService";
import { ObjectId } from "mongoose";

class DeploymentService extends BaseAuthorizedService {

    async getByEnvironmentId(environmentId: string | ObjectId){
        await this.ensureAccessToEnvironment(environmentId);
        return Deployment.find({ environmentId });
    }
    

}

export default DeploymentService;
