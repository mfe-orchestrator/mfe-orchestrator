import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button/button';
import { Input } from '../ui/input/input';
import useMicrofrontendsApi from '@/hooks/apiClients/useMicrofrontendsApi';
import useCodeRepositoriesApi from '@/hooks/apiClients/useCodeRepositoriesApi';

interface BuildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  microfrontendId: string;
  microfrontendName: string;
}

export function BuildDialog({
  open,
  onOpenChange,
  microfrontendId,
  microfrontendName
}: BuildDialogProps) {
  const { t } = useTranslation();
  const { build, getSingle } = useMicrofrontendsApi();
  const { getBranches } = useCodeRepositoriesApi();
  const [buildVersion, setBuildVersion] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);

  // Get microfrontend data first
  const microfrontendQuery = useQuery({
    queryKey: ['microfrontend', microfrontendId],
    queryFn: () => getSingle(microfrontendId),
    enabled: open && !!microfrontendId,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', microfrontendId],
    queryFn: () => {
      const mfe = microfrontendQuery.data;
      if (!mfe?.codeRepository?.repositoryId || !mfe?.codeRepository?.name) {
        throw new Error('No repository configured');
      }
      return getBranches(mfe.codeRepository.repositoryId, mfe.codeRepository.name);
    },
    enabled: open && !!microfrontendId && !!microfrontendQuery.data?.codeRepository?.repositoryId,
  });

  useEffect(() => {
    if (branchesQuery.data && branchesQuery.data.length > 0 && !selectedBranch) {
      const defaultBranch = branchesQuery.data.find(b => b.default) || branchesQuery.data[0];
      setSelectedBranch(defaultBranch.name);
    }
  }, [branchesQuery.data, selectedBranch]);

  const handleBuild = async () => {
    if (!buildVersion.trim() || !microfrontendId || !selectedBranch) return;

    setIsBuilding(true);
    try {
      await build(microfrontendId, buildVersion.trim());
      setBuildVersion('');
      onOpenChange(false);
    } catch (error) {
      console.error("Build failed:", error);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setBuildVersion('');
    setSelectedBranch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('microfrontend.build.title', { name: microfrontendName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="branch" className="text-sm font-medium">
              {t('microfrontend.build.branch')}
            </label>
          </div>
          <div>
            <label htmlFor="version" className="text-sm font-medium">
              {t('microfrontend.build.version')}
            </label>
            <Input
              id="version"
              value={buildVersion}
              onChange={e => setBuildVersion(e.target.value)}
              placeholder={t('microfrontend.build.versionPlaceholder')}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={handleClose} disabled={isBuilding}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleBuild} disabled={!buildVersion.trim() || !selectedBranch || isBuilding || microfrontendQuery.isLoading || branchesQuery.isLoading}>
            {isBuilding ? t('microfrontend.build.building') : t('microfrontend.build.startBuild')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BuildDialog;