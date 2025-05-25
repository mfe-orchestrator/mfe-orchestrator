export class UserNotFoundError extends Error {
  public readonly email : string

  constructor(email: string) {
    super(`User with email ${email} not found`);
    this.name = 'UserNotFoundError';
    this.email = email;
  }
}
