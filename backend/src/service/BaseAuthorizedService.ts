import { Types } from 'mongoose';
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError";
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError";
import { IUser } from "../models/UserModel";
import UserProject from '../models/UserProjectModel';
import Environment from '../models/EnvironmentModel';

export default abstract class BaseAuthorizedService {
  private user?: IUser;

  public constructor(user?: IUser) {
    this.user = user;
  }

  /**
   * Ensures the current user has access to the specified environment
   * @param environmentId The ID of the environment to check access for
   * @throws {UserCannotAccessThisEnvironmentError} If user doesn't have access
   */
  protected async ensureAccessToEnvironment(environmentId: string): Promise<void> {
    if (!await this.hasAccessToEnvironment(environmentId)) {
      throw new UserCannotAccessThisEnvironmentError(this.getUser());
    }
  }

  /**
   * Ensures the current user has access to the specified project
   * @param projectId The ID of the project to check access for
   * @throws {UserCannotAccessThisProjectError} If user doesn't have access
   */
  protected async ensureAccessToProject(projectId: string): Promise<void> {
    if (!await this.hasAccessToProject(projectId)) {
      throw new UserCannotAccessThisProjectError(this.getUser());
    }
  }

  /**
   * Checks if the current user has access to the specified environment
   * @param environmentId The ID of the environment to check access for
   * @returns Promise<boolean> True if user has access, false otherwise
   */
  protected async hasAccessToEnvironment(environmentId: string): Promise<boolean> {
    if (!this.user) {
      return false;
    }

    // Check if environment exists and get its project ID
    const environment = await Environment.findOne({ _id: environmentId })
    if (!environment) {
      return false;
    }

    // Check if user has access to the project that owns this environment
    return this.hasAccessToProject(environment.projectId);
  }

  /**
   * Checks if the current user has access to the specified project
   * @param projectId The ID of the project to check access for
   * @returns Promise<boolean> True if user has access, false otherwise
   */
  protected async hasAccessToProject(projectId: string): Promise<boolean> {
    if (!this.user) {
      return false;
    }

    // Check if user is directly associated with the project
    const userProject = await UserProject.findOne({
        userId: new Types.ObjectId(this.user._id.toString()),
        projectId: new Types.ObjectId(projectId)
      });

      // If user has any role in the project, they have access
      return Boolean(userProject);
  }

  /**
   * Gets the current user
   * @returns The current user or undefined if not set
   */
  protected getUser(): IUser | undefined {
    return this.user;
  }
}
