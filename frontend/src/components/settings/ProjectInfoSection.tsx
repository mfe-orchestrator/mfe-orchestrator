import { Project } from '@/hooks/apiClients/useProjectApi';
import { Button } from '@/components/ui/button/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface InfoItemProps {
  label: string;
  value: string;
  isMonospace?: boolean;
  copyable?: boolean;
}

const InfoItem: React.FC<InfoItemProps> = ({ label, value, isMonospace = false, copyable = true }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 flex flex-col">
      <Label className="text-sm text-muted-foreground mb-1 block flex-none">
        {label}
      </Label>
      <div className="flex justify-between items-center flex-1">
        <span className={`${isMonospace ? 'font-mono' : ''} text-sm flex-1`}>
          {value}
        </span>
        {copyable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  navigator.clipboard.writeText(value);
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
        )}
      </div>
    </div>
  );
};

interface ProjectInfoSectionProps extends Project {
  onUpdateProjectName: (newName: string) => Promise<void>;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  name,
  slug,
  _id
}) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardTitle>
        {t('settings.settingsPage.projectInfo.title')}
      </CardTitle>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InfoItem
            label={t('settings.settingsPage.projectInfo.name')}
            value={name}
            copyable={false}
          />

          <InfoItem
            label={t('settings.settingsPage.projectInfo.slug')}
            value={slug}
          />

          <InfoItem
            label={t('settings.settingsPage.projectInfo.id')}
            value={_id}
          />
        </div>
      </CardContent>
    </Card>
  );
}
