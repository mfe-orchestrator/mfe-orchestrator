import { AuthenticationType } from '../../api/apiClient';
import useApiClient from '../useApiClient';

export interface ExistsOneUserDTO{
  exists: boolean;
}

export interface RegisterFirstUserData{
  email: string;
  password: string;
  project: string;
}

const useStartupApi = () => {
  const { doRequest } = useApiClient();

  async function createFirstUserAndProject(userData: RegisterFirstUserData) {
    const response = await doRequest<ExistsOneUserDTO>({
      url: '/api/startup/registration',
      method: 'POST',
      authenticated: AuthenticationType.NONE,
      data: userData
    });
    return response.data.exists;
  }

  async function existsAtLeastOneUser() {
    const response = await doRequest<ExistsOneUserDTO>({
      url: '/api/startup/users/exists',
      authenticated: AuthenticationType.NONE,
    });
    return response?.data?.exists;
  }

  return {
    existsAtLeastOneUser,
    createFirstUserAndProject
  };
};

export default useStartupApi;
