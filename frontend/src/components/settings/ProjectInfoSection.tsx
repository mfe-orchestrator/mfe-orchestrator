import { Project } from '@/hooks/apiClients/useProjectApi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProjectInfoSectionProps extends Project {
  onUpdateProjectName: (newName: string) => Promise<void>;
}

export function ProjectInfoSection({ 
  name, 
  slug,
  _id: id,
  onUpdateProjectName 
}: ProjectInfoSectionProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(name);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (editingName.trim() === '') return;
    
    setIsLoading(true);
    try {
      await onUpdateProjectName(editingName);
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">
        {t('settings.settingsPage.projectInfo.title')}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Label className="text-sm text-muted-foreground mb-1 block">
            {t('settings.settingsPage.projectInfo.name')}
          </Label>
          {isEditing ? (
            <div className="flex gap-2">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button 
                onClick={handleSave}
                disabled={editingName.trim() === name || editingName.trim() === '' || isLoading}
                className={isLoading ? 'opacity-75' : ''}
              >
                {t('settings.settingsPage.projectInfo.save')}
              </Button>
              <Button 
                variant="secondary"
                onClick={() => {
                  setEditingName(name);
                  setIsEditing(false);
                }}
                disabled={isLoading}
              >
                {t('settings.settingsPage.projectInfo.cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span>{name}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsEditing(true)}
                className="h-8 px-2"
              >
                {t('settings.settingsPage.projectInfo.edit')}
              </Button>
            </div>
          )}
        </div>
        
        <div className="space-y-4">
          <Label className="text-sm text-muted-foreground mb-1 block">
            {t('settings.settingsPage.projectInfo.slug')}
          </Label>
          <div className="flex justify-between items-center">
            <span className="font-mono text-sm">{slug}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(slug);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">{t('settings.settingsPage.projectInfo.copy')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('settings.settingsPage.projectInfo.copy')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        
        <div className="space-y-4">
          <Label className="text-sm text-muted-foreground mb-1 block">
            {t('settings.settingsPage.projectInfo.id')}
          </Label>
          <div className="flex justify-between items-center">
            <span className="font-mono text-sm">{id}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(id);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">{t('settings.settingsPage.projectInfo.copy')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('settings.settingsPage.projectInfo.copied')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </Card>
  );
}
