
import React from 'react';
import EnvironmentSelector from '../../components/environment/EnvironmentSelector';
import useProjectStore from '@/store/useProjectStore';
import DeploymentList from './DeploymentList';
import EnvironmentsGate from '@/theme/EnvironmentsGate';

const DeploymentDashboard : React.FC = () => {
  const projectStore = useProjectStore();

  const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0;

  return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <h2 className="text-3xl font-bold tracking-tight">
              {projectStore.project?.name}
            </h2>
            {isThereAtLeastOneEnvironment &&
                <EnvironmentSelector
                  selectedEnvironment={projectStore.environment}
                  environments={projectStore.environments}
                  onEnvironmentChange={projectStore.setEnvironment}
                />
            }
          </div>
        </div>
        <EnvironmentsGate>
          <DeploymentList environmentId={projectStore.environment?._id} /> 
        </EnvironmentsGate>
      </div>
  );
};

export default DeploymentDashboard;
