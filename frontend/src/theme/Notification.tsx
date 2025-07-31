import { useEffect } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import useToastNotificationStore from "@/store/useToastNotificationStore";

export default function Notification() {
  const { notification } = useToastNotificationStore();

  useEffect(() => {
    if (notification?.message) {
      const { type, message, duration = 5000 } = notification;
      
      const toastConfig = {
        position: "top-right" as const,
        autoClose: duration,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "light",
        transition: Slide,
      };

      switch (type) {
        case 'success':
          toast.success(message, toastConfig);
          break;
        case 'error':
          toast.error(message, toastConfig);
          break;
        case 'warning':
          toast.warn(message, toastConfig);
          break;
        case 'info':
        default:
          toast.info(message, toastConfig);
          break;
      }
    }
  }, [notification]);

  return (
    <ToastContainer
      position="top-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
      transition={Slide}
    />
  );
}
