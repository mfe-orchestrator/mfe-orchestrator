
import { useState } from 'react';
import { MicrofrontendProps } from '../../components/microfrontend/MicrofrontendCard';
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
import NoEnvironmentPlaceholder from './NoEnvironmentPlaceholder';
import MicrofrontendList from './MicrofrontendList';

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [microfrontends, setMicrofrontends] = useState<MicrofrontendProps[]>([]);
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


  // Filter microfrontends based on search term and status
  const filteredMicrofrontends = microfrontends.filter(mfe => {
    const matchesSearch = mfe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mfe.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || mfe.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Count microfrontends by status
  const counts = {
    all: microfrontends.length,
    active: microfrontends.filter(mfe => mfe.status === 'active').length,
    inactive: microfrontends.filter(mfe => mfe.status === 'inactive').length,
    error: microfrontends.filter(mfe => mfe.status === 'error').length
  };

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
              <>
                <EnvironmentSelector
                  selectedEnvironment={projectStore.environment}
                  environments={projectStore.environments}
                  onEnvironmentChange={projectStore.setEnvironment}
                />
                <Badge variant="outline" className="ml-2">
                  {counts.all}
                </Badge>
              </>
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
                  <SelectItem value="all">Tutti ({counts.all})</SelectItem>
                  <SelectItem value="active">Attivi ({counts.active})</SelectItem>
                  <SelectItem value="inactive">Inattivi ({counts.inactive})</SelectItem>
                  <SelectItem value="error">Errore ({counts.error})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        </div>
        {isThereAtLeastOneEnvironment ?
          <MicrofrontendList searchTerm={searchTerm} statusFilter={statusFilter} environmentId={projectStore.environment?._id}/> 
          : 
          <NoEnvironmentPlaceholder onSaveSuccess={onSaveEnvironmentsSucess} />}
      </div>
    </ApiDataFetcher>
  );
};

export default DashboardPage;
