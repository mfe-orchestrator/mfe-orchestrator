import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button/button';
import { Card, CardContent } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';
import { useGlobalParameters } from '@/contexts/GlobalParameterProvider';
import { useNavigate } from 'react-router-dom';

interface AddRepositoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type RepositoryProvider = 'azure' | 'github' | 'gitlab';

const AddRepositoryDialog = ({ isOpen, onOpenChange }: AddRepositoryDialogProps) => {
  const { t } = useTranslation();
  const [selectedProvider, setSelectedProvider] = useState<RepositoryProvider | null>(null);
  const globalParameters = useGlobalParameters(); 
  const githubClientId = globalParameters.getParameter("codeRepository.github.clientId")
  const navigate = useNavigate();

  const providers = [
    githubClientId && {
      id: 'github' as const,
      name: t('codeRepositories.addDialog.providers.github.name'),
      description: t('codeRepositories.addDialog.providers.github.description'),
      icon: <img src="/img/GitHub.svg" alt="GitHub" className="h-8 w-8" />,
      color: 'bg-muted hover:bg-muted/80'
    },
    {
      id: 'azure' as const,
      name: t('codeRepositories.addDialog.providers.azure.name'),
      description: t('codeRepositories.addDialog.providers.azure.description'),
      icon: <img src="/img/AzureDevOps.svg" alt="Azure DevOps" className="h-8 w-8" />,
      color: 'bg-muted hover:bg-muted/80'
    },
    {
      id: 'gitlab' as const,
      name: t('codeRepositories.addDialog.providers.gitlab.name'),
      description: t('codeRepositories.addDialog.providers.gitlab.description'),
      icon: <img src="/img/GitLab.svg" alt="GitLab" className="h-8 w-8" />,
      color: 'bg-muted hover:bg-muted/80'
    }
  ].filter(Boolean);

  const handleProviderSelect = (providerId: RepositoryProvider) => {
    setSelectedProvider(providerId);
    
    if (providerId === 'github') {
      // Redirect to GitHub OAuth for SSO access
      const redirectUri = `${window.location.origin}/code-repositories/callback/github`;
      const scope = 'repo,public_repo,read:user,read:org,workflow';
      const state = btoa(JSON.stringify({ 
        provider: 'github',
        timestamp: Date.now() 
      }));
      
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&prompt=login`;
      
      // Open GitHub auth in current window
      window.location.href = githubAuthUrl;
      return;
    }
    
    if (providerId === 'azure') {
      navigate('/code-repositories/azure');
    }
    
    if (providerId === 'gitlab') {
      navigate('/code-repositories/gitlab');
    }
    
    // Close dialog for now
    onOpenChange(false);
    setSelectedProvider(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedProvider(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('codeRepositories.addDialog.title')}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('codeRepositories.addDialog.description')}
          </p>
          
          <div className="grid gap-3">
            {providers.map((provider) => (
              <Card 
                key={provider.id}
                className={`cursor-pointer transition-colors ${provider.color} ${
                  selectedProvider === provider.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleProviderSelect(provider.id)}
              >
                <CardContent className="flex items-center p-4">
                  <div className="mr-4">
                    {provider.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{provider.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {provider.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRepositoryDialog;