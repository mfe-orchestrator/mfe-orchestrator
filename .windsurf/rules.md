# Project Rules

- Non usare next router - Stiamo usando react coin react-router-dom
- Internationalize everything using the **i18n module** and the `public/locales` folder.  
- Always reuse existing **UI elements** instead of creating new ones from scratch.  
- For forms, always use **react-hook-form**.  
- For icons, use only **lucide-react**.  
- For toast notifications, use:  
  ```ts
  const notifications = useToastNotificationStore();
  notifications.showSuccessNotification();
  ```
- All pages must be located under src/pages.
- All components must be located under src/components.
- The API client is located under src/hooks/apiClient.
- WhenYou Create a page add the link in the sidebar and the route 

## Api calls
- Quando hai una api call da fare onLoad dell pagina usa `import { useQuery } from '@tanstack/react-query';`  e racchiudi tutto il componente in `<ApiDataFetcher queries={[dataQuery]}><></ApiDataFetcher>` 