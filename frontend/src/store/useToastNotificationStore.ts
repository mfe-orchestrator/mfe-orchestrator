import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ToastNotification {
  message: string | React.ReactNode;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastNotificationState {
  notification?: ToastNotification;
  showSuccessNotification: (notification: Omit<ToastNotification, 'type'>) => void;
  showErrorNotification: (notification: Omit<ToastNotification, 'type'>) => void;
  showWarningNotification: (notification: Omit<ToastNotification, 'type'>) => void;
  showInfoNotification: (notification: Omit<ToastNotification, 'type'>) => void;
}

const useToastNotificationStore = create<ToastNotificationState>()(
  devtools(
    (set) => ({
      notification: undefined,
      showSuccessNotification: (notification) => {
        set({ notification: { ...notification, type: 'success' } });
      },
      showErrorNotification: (notification) => {
        set({ notification: { ...notification, type: 'error' } });
      },
      showWarningNotification: (notification) => {
        set({ notification: { ...notification, type: 'warning' } });
      },
      showInfoNotification: (notification) => {
        set({ notification: { ...notification, type: 'info' } });
      },
    }),
    {
      name: 'toast-notification-storage',
    }
  )
);

export default useToastNotificationStore;