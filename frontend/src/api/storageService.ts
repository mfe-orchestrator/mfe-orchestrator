import apiClient from './apiClient';

export interface Storage {
  id: string;
  name: string;
  type: string;
  configuration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const getStorages = async (): Promise<Storage[]> => {
  const response = await apiClient.get('/storages');
  return response.data;
};

export const getStorage = async (id: string): Promise<Storage> => {
  const response = await apiClient.get(`/storages/${id}`);
  return response.data;
};

export const createStorage = async (data: Omit<Storage, 'id' | 'createdAt' | 'updatedAt'>): Promise<Storage> => {
  const response = await apiClient.post('/storages', data);
  return response.data;
};

export const updateStorage = async (id: string, data: Partial<Storage>): Promise<Storage> => {
  const response = await apiClient.patch(`/storages/${id}`, data);
  return response.data;
};

export const deleteStorage = async (id: string): Promise<void> => {
  await apiClient.delete(`/storages/${id}`);
};
