
class AuthenticationError extends Error{

    type = "AuthenticationError"

    constructor(message : string) {
        super(message);

        Error.captureStackTrace(this, this.constructor);
      }
}

export default AuthenticationError