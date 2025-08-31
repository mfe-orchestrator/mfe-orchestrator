import { useState } from 'react';
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

  return (
    <Card className="border-destructive/50">
      <div className="space-y-4 p-6">
        <div>
          <TypographyH3 className="text-destructive">
            Danger Zone
          </TypographyH3>
          <TypographySmall className="text-muted-foreground">
            These actions are irreversible. Please be certain.
          </TypographySmall>
        </div>

        <Separator className="bg-destructive/20" />

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <TypographyP className="font-semibold">Delete this project</TypographyP>
            <TypographySmall className="text-muted-foreground">
              Once you delete a project, there is no going back. Please be certain.
            </TypographySmall>
          </div>
          <Button 
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setOpened(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Project
          </Button>
        </div>
      </div>

      <Dialog open={opened} onOpenChange={setOpened}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">This action cannot be undone</p>
                <p className="text-sm">
                  This will permanently delete the project, configurations, and all associated data.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-4 py-4">
            <TypographySmall>
              Please type <span className="font-bold">{projectName}</span> to confirm.
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
              variant="secondary"
              onClick={() => setOpened(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={confirmationText !== projectName}
              className={cn(
                "w-full sm:w-auto",
                deleteProjectMutation.isPending && "opacity-50 cursor-not-allowed"
              )}
            >
              {deleteProjectMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
