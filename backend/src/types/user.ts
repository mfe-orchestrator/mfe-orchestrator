export interface UserRegistrationDTO {
  email: string;
  password: string;
  name: string;
  surname: string;
}

export interface LoginUser {
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}
