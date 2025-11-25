import { ApiStatusHandler } from "@/components/organisms";
import SinglePageLayout from "@/components/SinglePageLayout";
import { Button } from "@/components/atoms";
import { Input } from "@/components/ui/input/input";
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent";
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList";
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger";
import { Tabs } from "@/components/ui/tabs/tabs";
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi";
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi";
import useProjectStore from "@/store/useProjectStore";
import { useQuery } from "@tanstack/react-query";
import { CirclePlus, LayoutGrid, Search, StretchHorizontal, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MicrofrontendFlow, MicrofrontendsGrid, MicrofrontendsTable } from "./partials/views";

const Microfrontends = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const projectStore = useProjectStore();
  const projectId = projectStore.project?._id;

  const codeRepositoriesApi = useCodeRepositoriesApi();
  const microfrontendsApi = useMicrofrontendsApi();

  const [searchTerm, setSearchTerm] = useState("");
  const [tabsValue, setTabsValue] = useState<"flow" | "grid" | "table">("flow");

  const onResetFilters = () => {
    setSearchTerm("");
  };

  const microfrontendListQuery = useQuery({
    queryKey: ["microfrontends-by-project-id", projectId],
    queryFn: () => microfrontendsApi.getByProjectId(projectId),
    enabled: !!projectId,
  });

  const microfrontendsList = useMemo(() => {
    const data = microfrontendListQuery?.data;

    if (!data) {
      return null;
    }

    if (!searchTerm) return data;

    const filteredData = data.filter((mfe) => {
      const nameMatch = searchTerm
        ? mfe.name.toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      return nameMatch;
    });

    return filteredData;
  }, [microfrontendListQuery?.data, searchTerm]);

  const onAddNewMicrofrontend = async (parentId?: string) => {
    const repositories = await codeRepositoriesApi.getRepositoriesByProjectId(
      projectStore.project?._id!,
    );
    if (repositories && repositories.length > 0) {
      if (parentId) {
        navigate(`/templates-library?parentId=${parentId}`);
      } else {
        navigate(`/templates-library`);
      }
    } else {
      if (parentId) {
        navigate(`/microfrontend/new?parentId=${parentId}`);
      } else {
        navigate(`/microfrontend/new`);
      }
    }
  };

  return (
    <SinglePageLayout
      title={t("microfrontend.dashboard.title")}
      description={t("microfrontend.dashboard.description")}
      left={
        <div className="flex-[1_1_280px] flex items-center justify-end gap-2 @[509px]:max-w-xs">
          <div className="relative w-full flex-grow">
            <Search className="absolute left-3 top-3 h-4 w-4 text-secondary" />
            <Input
              placeholder={t("microfrontend.dashboard.searchPlaceholder")}
              className="pl-8 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      }
      right={
        tabsValue !== "grid" ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => onAddNewMicrofrontend()}
              className="flex-[0_0_auto]">
              <CirclePlus />
              {t("microfrontend.add_new")}
            </Button>
          </div>
        ) : null
      }>
      <ApiStatusHandler queries={[microfrontendListQuery]}>
        <Tabs
          defaultValue="flow"
          className="space-y-4"
          iconButtons
          tabsListPosition="end">
          <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap">
            <div className="flex-[1_1_280px] max-w-[600px]">
              <h2 className="text-xl font-semibold text-foreground-secondary">
                {microfrontendListQuery.isSuccess && microfrontendsList.length > 0
                  ? `${microfrontendsList.length} ${t("microfrontend.dashboard.title")}`
                  : t("microfrontend.no_microfrontends_found")}
              </h2>
              {microfrontendListQuery.isSuccess && microfrontendsList.length === 0 && (
                <p className="text-foreground-secondary mt-1">
                  {t("microfrontend.no_microfrontends_found_description")}
                </p>
              )}
            </div>
            <TabsList>
              <TabsTrigger
                value="flow"
                onClick={() => setTabsValue("flow")}>
                <Workflow />
              </TabsTrigger>
              <TabsTrigger
                value="grid"
                onClick={() => setTabsValue("grid")}>
                <LayoutGrid />
              </TabsTrigger>
              <TabsTrigger
                value="table"
                onClick={() => setTabsValue("table")}>
                <StretchHorizontal />
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="flow">
            <MicrofrontendFlow
              microfrontends={microfrontendsList}
              onAddNewMicrofrontend={onAddNewMicrofrontend}
            />
          </TabsContent>
          <TabsContent value="grid">
            <MicrofrontendsGrid
              microfrontendsList={microfrontendsList}
              onAddNewMicrofrontend={onAddNewMicrofrontend}
            />
          </TabsContent>

          <TabsContent value="table">
            <MicrofrontendsTable microfrontends={microfrontendsList} />
          </TabsContent>
        </Tabs>
      </ApiStatusHandler>
    </SinglePageLayout>
  );
};

export default Microfrontends;
