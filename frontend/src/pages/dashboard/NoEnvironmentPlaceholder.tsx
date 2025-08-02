

import React, { useState } from 'react';
import presetEnvironmentGroups, { EnvironmentPreset } from '@/utils/EnviromentsPresets';
import EnvironmentSet from '@/components/EnvironmentSet';
import EnvironmentList from '@/components/EnvironmentList';
import useEnvironmentsApi, { EnvironmentDTO } from '@/hooks/apiClients/useEnvironmentsApi';
import { useMutation } from '@tanstack/react-query';

interface NoEnvironmentPlaceholderProps {
  onSaveSuccess: (environments: EnvironmentDTO[]) => void;
}


const NoEnvironmentPlaceholder : React.FC<NoEnvironmentPlaceholderProps> = ({onSaveSuccess}) => {
  const [customEnvironments, setCustomEnvironments] = useState<EnvironmentPreset[]>();
  const environmentsApi = useEnvironmentsApi();

  const handleAddPresetEnvs = (envs: EnvironmentPreset[]) => {
    const newEnvs = envs.map(env => ({...env}));
    setCustomEnvironments(newEnvs);
  };

  const saveEnvironmentsMutation = useMutation({
    mutationFn: async (environments : EnvironmentDTO[]) => {
      const newEnvironments = await environmentsApi.createEnvironmentsBulk(environments)
      onSaveSuccess(newEnvironments)
    }
  })

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Configura gli ambienti
        </h2>
      </div>

      <div className="mt-8">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Ambienti predefiniti</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presetEnvironmentGroups.map((preset, index) => (
            <EnvironmentSet
              key={index}
              name={preset.name}
              environments={preset.environments}
              onClick={handleAddPresetEnvs}
            />
          ))}
        </div>
      </div>

      <EnvironmentList
        environments={customEnvironments}
        onSaveEnvironments={async (e) => { await saveEnvironmentsMutation.mutateAsync(e) }}
      />
    </div>
  );
};

export default NoEnvironmentPlaceholder;