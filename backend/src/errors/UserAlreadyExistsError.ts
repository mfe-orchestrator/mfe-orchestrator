export class UserAlreadyExistsError extends Error {

  public readonly email : string;

  constructor(email: string) {
    super(`User with email ${email} already exists`);
    this.name = 'UserAlreadyExistsError';
    this.email = email;
  }
}
