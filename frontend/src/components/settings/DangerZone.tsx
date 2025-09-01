import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Trash2 } from 'lucide-react';
import useProjectApi from '@/hooks/apiClients/useProjectApi';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../ui/button/button';
import { Input } from '../ui/input/input';

// Simple class name concatenation helper
const cn = (...classes: (string | boolean | undefined)[]) => 
  classes.filter(Boolean).join(' ');

// Temporary type definitions for typography components
const TypographyH3 = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <h3 className={`scroll-m-20 text-2xl font-semibold tracking-tight ${className}`}>
    {children}
  </h3>
);

const TypographyP = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <p className={`leading-7 [&:not(:first-child)]:mt-6 ${className}`}>
    {children}
  </p>
);

const TypographySmall = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <small className={`text-sm font-medium leading-none ${className}`}>
    {children}
  </small>
);


interface DangerZoneProps {
  projectName: string;
  projectId: string;
  onDeleteSuccess: () => Promise<void>;
}

export function DangerZone({ projectName, projectId, onDeleteSuccess }: DangerZoneProps) {
  const [opened, setOpened] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const projectApi = useProjectApi();

  const deleteProjectMutation = useMutation({
    mutationFn: projectApi.deleteProject
  })

  const handleDeleteProject = async () => {
    if (confirmationText !== projectName) return;

    await deleteProjectMutation.mutateAsync(projectId)
    await onDeleteSuccess?.()
    setOpened(false);

  };

  const { t } = useTranslation();

  return (
    <Card className="border-destructive/50 p-6">
      <div className="space-y-4">
        <div>
          <TypographyH3 className="text-destructive">
            {t('settings.dangerZone.title')}
          </TypographyH3>
          <TypographySmall className="text-muted-foreground">
            {t('settings.dangerZone.subtitle')}
          </TypographySmall>
        </div>

        <Separator className="bg-destructive/20" />

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <TypographyP className="font-semibold">
              {t('settings.dangerZone.delete.title')}
            </TypographyP>
            <TypographySmall className="text-muted-foreground">
              {t('settings.dangerZone.delete.description')}
            </TypographySmall>
          </div>
          <Button 
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setOpened(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('settings.dangerZone.delete.button')}
          </Button>
        </div>
      </div>

      <Dialog open={opened} onOpenChange={setOpened}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('settings.dangerZone.delete.dialog.title')}</DialogTitle>
          </DialogHeader>
          
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('settings.dangerZone.delete.dialog.warning')}</AlertTitle>
            <AlertDescription>
              {t('settings.dangerZone.delete.dialog.description', { projectName })}
              <div className="mt-2">
                {t('settings.dangerZone.delete.dialog.confirmation', { projectName: <span className="font-bold">{projectName}</span> })}
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-4 py-4">
            <TypographySmall>
              {t('settings.dangerZone.delete.dialog.confirmationText', { projectName })}
            </TypographySmall>

            <Input
              placeholder={projectName}
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              className="w-full"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost"
              onClick={() => setOpened(false)}
              className="mr-2"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={confirmationText !== projectName || deleteProjectMutation.isPending}
              className={cn(
                "w-full sm:w-auto",
                deleteProjectMutation.isPending && "opacity-50 cursor-not-allowed"
              )}
            >
              {deleteProjectMutation.isPending 
                ? t('settings.dangerZone.delete.dialog.deleting') 
                : t('settings.dangerZone.delete.dialog.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
