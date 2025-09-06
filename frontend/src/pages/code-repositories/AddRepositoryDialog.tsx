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
      icon: (
        <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center">
          <span className="text-white text-xs font-bold">GH</span>
        </div>
      ),
      color: 'bg-gray-50 hover:bg-gray-100 border-gray-200'
    },
    {
      id: 'azure' as const,
      name: t('codeRepositories.addDialog.providers.azure.name'),
      description: t('codeRepositories.addDialog.providers.azure.description'),
      icon: (
        <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center">
          <span className="text-white text-xs font-bold">Az</span>
        </div>
      ),
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200'
    },
    {
      id: 'gitlab' as const,
      name: t('codeRepositories.addDialog.providers.gitlab.name'),
      description: t('codeRepositories.addDialog.providers.gitlab.description'),
      icon: (
        <div className="h-8 w-8 bg-orange-600 rounded flex items-center justify-center">
          <GitBranch className="h-5 w-5 text-white" />
        </div>
      ),
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200'
    }
  ].filter(Boolean);

  const handleProviderSelect = (providerId: RepositoryProvider) => {
    setSelectedProvider(providerId);
    
    if (providerId === 'github') {
      // Redirect to GitHub OAuth for SSO access
      const redirectUri = `${window.location.origin}/code-repositories/callback/github`;
      const scope = 'repo,public_repo,read:user';
      const state = btoa(JSON.stringify({ 
        provider: 'github',
        timestamp: Date.now() 
      }));
      
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      
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