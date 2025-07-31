import { IUser } from "../models/UserModel";
import CustomError from "./CustomError";

export default class UserCannotAccessThisProjectError extends CustomError {

  constructor(user?: IUser) {
    super(`User ${user?.email} cannot access this project`);
    this.name = 'UserCannotAccessThisProjectError';
    Object.setPrototypeOf(this, UserCannotAccessThisProjectError.prototype);
  }

  static isInstance(error: unknown): error is UserCannotAccessThisProjectError {
    return error instanceof UserCannotAccessThisProjectError;
  }
}
