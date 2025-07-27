import { ClientSession, ObjectId } from "mongoose";
import UserProject, { IUserProject } from "../models/UserProjectModel";
import { RoleInProject } from "../models/UserProjectModel";


class UserProjectService{

    async addUserToProject(userId: ObjectId, projectId: ObjectId, role: RoleInProject, session?: ClientSession){
        const projectJoin = new UserProject({
            userId,
            projectId,
            role
        })

        return projectJoin.save({ session });
    }

}



export default UserProjectService