
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import EnvironmentSelector from '../../components/environment/EnvironmentSelector';
import { useQuery } from '@tanstack/react-query';
import useProjectStore from '@/store/useProjectStore';
import { EnvironmentDTO } from '@/hooks/apiClients/useEnvironmentsApi';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useProjectApi from '@/hooks/apiClients/useProjectApi';
import NoEnvironmentPlaceholder from '../../components/environment/NoEnvironmentPlaceholder';
import MicrofrontendList from '@/components/microfrontend/MicrofrontendList';

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const projectsApi = useProjectApi()
  const projectStore = useProjectStore();

  const onSaveEnvironmentsSucess = (environments: EnvironmentDTO[]) =>{
    projectStore.setEnvironments(environments)
    projectStore.setEnvironment(environments[0])
  }

  const environmentsQuery = useQuery({
    queryKey: ['environments', projectStore?.project?._id],
    queryFn: async () => {
      const environments = await projectsApi.getEnvironmentsByProjectId(projectStore.project?._id)
      onSaveEnvironmentsSucess(environments)
      return environments;
    },
    enabled: !!projectStore.project?._id
  });

  const onResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
  }

  const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0;

  return (
    <ApiDataFetcher queries={[environmentsQuery]}>
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
          {isThereAtLeastOneEnvironment &&
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca microfrontend..."
                  className="pl-8 w-full md:w-[250px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtra per stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="ACTIVE">Attivi</SelectItem>
                  <SelectItem value="DISABLED">Disabilitati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        </div>
        {isThereAtLeastOneEnvironment ?
          <MicrofrontendList searchTerm={searchTerm} statusFilter={statusFilter} environmentId={projectStore.environment?._id} onResetFilters={onResetFilters} /> 
          : 
          <NoEnvironmentPlaceholder onSaveSuccess={onSaveEnvironmentsSucess} />}
      </div>
    </ApiDataFetcher>
  );
};

export default DashboardPage;
