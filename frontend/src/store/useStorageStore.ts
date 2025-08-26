import { create } from 'zustand';
import { Storage } from '../api/storageService';

interface StorageState {
  storages: Storage[];
  isLoading: boolean;
  error: string | null;
  fetchStorages: () => Promise<void>;
  addStorage: (storage: Omit<Storage, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateStorage: (id: string, updates: Partial<Storage>) => Promise<void>;
  deleteStorage: (id: string) => Promise<void>;
  clearError: () => void;
}

const useStorageStore = create<StorageState>((set, get) => ({
  storages: [],
  isLoading: false,
  error: null,

  fetchStorages: async () => {
    set({ isLoading: true, error: null });
    try {
      const { getStorages } = await import('../api/storageService');
      const storages = await getStorages();
      set({ storages, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to fetch storages', isLoading: false });
    }
  },

  addStorage: async (storage) => {
    set({ isLoading: true, error: null });
    try {
      const { createStorage } = await import('../api/storageService');
      const newStorage = await createStorage(storage);
      set((state) => ({
        storages: [...state.storages, newStorage],
        isLoading: false,
      }));
    } catch (error) {
      set({ error: 'Failed to add storage', isLoading: false });
      throw error;
    }
  },

  updateStorage: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const { updateStorage: updateStorageApi } = await import('../api/storageService');
      const updatedStorage = await updateStorageApi(id, updates);
      set((state) => ({
        storages: state.storages.map((s) =>
          s.id === id ? { ...s, ...updatedStorage } : s
        ),
        isLoading: false,
      }));
    } catch (error) {
      set({ error: 'Failed to update storage', isLoading: false });
      throw error;
    }
  },

  deleteStorage: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { deleteStorage: deleteStorageApi } = await import('../api/storageService');
      await deleteStorageApi(id);
      set((state) => ({
        storages: state.storages.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      set({ error: 'Failed to delete storage', isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useStorageStore;
