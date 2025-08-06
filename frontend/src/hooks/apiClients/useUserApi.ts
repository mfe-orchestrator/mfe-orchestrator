import { ThemeEnum } from '@/store/useThemeStore';
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
  language?:string
  theme?: ThemeEnum
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
      authenticated: AuthenticationType.NONE,
      method: 'POST',
      data: userData,
    });
    return response.data;
  }

  const saveTheme  = (theme: ThemeEnum) => {
    doRequest({
      url: '/api/users/theme',
      method: 'POST',
      silent: true,
      data: { theme },
    });
  }

  const saveLanguage  = (language: string) => {
    doRequest({
      url: '/api/users/language',
      method: 'POST',
      silent: true,
      data: { language },
    });
  }

  async function activateAccount(token: string) {
    await doRequest({
      url: '/api/users/account-activation',
      authenticated: AuthenticationType.NONE,
      method: 'POST',
      data: { token },
    });
    return true;
  }

  async function login(credentials: UserLoginDTO) {
    const response = await doRequest<AuthResponse>({
      url: '/api/users/login',
      authenticated: AuthenticationType.NONE,
      method: 'POST',
      data: credentials,
    });
    return response.data;
  }

  async function resetPasswordRequest(data: ResetPasswordRequestDTO) {
    return doRequest({
      url: '/api/users/forgot-password',
      authenticated: AuthenticationType.NONE,
      method: 'POST',
      data,
    });
  }

  async function resetPassword(data: ResetPasswordDataDTO) {
    await doRequest({
      url: '/api/users/reset-password',
      method: 'POST',
      authenticated: AuthenticationType.NONE,
      data,
    });
    return true;
  }

  async function getProfile() {
    const response = await doRequest<User>({
      url: '/api/users/profile',
      method: 'GET',
      authenticated: AuthenticationType.REQUIRED,
      silent: true
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
    activateAccount,
    inviteUser,
    saveTheme,
    saveLanguage
  };
};

export default useUserApi;
