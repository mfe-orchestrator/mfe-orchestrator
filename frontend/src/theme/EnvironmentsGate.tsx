import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi";
import useProjectStore from "@/store/useProjectStore";
import { useQuery } from "@tanstack/react-query";
import useProjectApi from "@/hooks/apiClients/useProjectApi";
import NoEnvironmentPlaceholder from "@/pages/environments/partials/NoEnvironmentPlaceholder";
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";

interface EnvironmentsGateProps extends React.PropsWithChildren {
    onSaveSuccess?: () => Promise<void> | void
}

const EnvironmentsGate: React.FC<EnvironmentsGateProps> = ({ children, onSaveSuccess }) => {

    const projectStore = useProjectStore();
    const projectsApi = useProjectApi()

    const onSaveEnvironmentsSucess = (environments: EnvironmentDTO[]) => {
        projectStore.setEnvironments(environments)
        projectStore.setEnvironment(environments[0])
        onSaveSuccess?.()
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

    const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0;

    return (
        <ApiDataFetcher queries={[environmentsQuery]}>
            {isThereAtLeastOneEnvironment ?
                <>
                    {children}
                </>
                :
                <NoEnvironmentPlaceholder onSaveSuccess={onSaveEnvironmentsSucess} />}
        </ApiDataFetcher>
    );
}

export default EnvironmentsGate