import { AuthenticationType } from '../../api/apiClient';
import useApiClient from '../useApiClient';

export interface ExistsOneUserDTO{
  exists: boolean;
}

const useStartupApi = () => {
  const { doRequest } = useApiClient();

  async function existsAtLeastOneUser() {
    const response = await doRequest<ExistsOneUserDTO>({
      url: '/startup/users/exists',
      authenticated: AuthenticationType.NONE,
    });
    return response.data.exists;
  }

  return {
    existsAtLeastOneUser
  };
};

export default useStartupApi;
