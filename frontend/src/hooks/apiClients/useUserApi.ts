import { AuthenticationType } from '../../api/apiClient';
import useApiClient from '../useApiClient';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRegistrationDTO {
  email: string;
  password: string;
  name?: string;
  surname?: string;
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

export interface ResetPasswordRequestDTO {
  email: string;
}

export interface ResetPasswordDataDTO {
  token: string;
  password: string;
}

export interface UserInvitationDTO {
  email: string;
  role?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

const useUserApi = () => {
  const { doRequest } = useApiClient();

  // Authentication
  async function register(userData: UserRegistrationDTO) {
    const response = await doRequest<AuthResponse>({
      url: '/api/users/registration',
      method: 'POST',
      data: userData,
    });
    return response.data;
  }

  async function login(credentials: UserLoginDTO) {
    const response = await doRequest<AuthResponse>({
      url: '/api/users/login',
      method: 'POST',
      data: credentials,
    });
    return response.data;
  }

  async function resetPasswordRequest(data: ResetPasswordRequestDTO) {
    await doRequest({
      url: '/api/users/forgot-password',
      method: 'POST',
      data: data,
    });
    return true;
  }

  async function resetPassword(data: ResetPasswordDataDTO) {
    await doRequest({
      url: '/api/users/reset-password',
      method: 'POST',
      data,
    });
    return true;
  }

  async function getProfile() {
    const response = await doRequest<User>({
      url: '/api/users/profile',
      method: 'GET',
      authenticated: AuthenticationType.REQUIRED,
    });
    return response.data;
  }

  async function inviteUser(invitationData: UserInvitationDTO) {
    const response = await doRequest<User>({
      url: '/api/users/invitation',
      method: 'POST',
      data: invitationData,
      authenticated: AuthenticationType.REQUIRED,
    });
    return response.data;
  }

  return {
    register,
    login,
    resetPasswordRequest,
    resetPassword,
    getProfile,
    inviteUser
  };
};

export default useUserApi;
