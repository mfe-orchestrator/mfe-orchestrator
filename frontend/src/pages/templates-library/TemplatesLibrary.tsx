import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { Input } from "../../components/ui/input/input";
import { Select, SelectValue } from "../../components/ui/select/select";
import { SelectTrigger } from "../../components/ui/select/partials/selectTrigger/selectTrigger";
import { SelectContent } from "../../components/ui/select/partials/selectContent/selectContent";
import { SelectItem } from "../../components/ui/select/partials/selectItem/selectItem";
import { TemplateCard, BlankTemplateCard } from "./partials";
import useMarketApi from "../../hooks/apiClients/useMarketApi";
import { ApiStatusHandler } from "@/components/organisms";
import SinglePageLayout from "@/components/SinglePageLayout";

export const TemplatesLibrary: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getMarkets } = useMarketApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFramework, setSelectedFramework] = useState<string>("all");
  const [selectedCompiler, setSelectedCompiler] = useState<string>("all");
  const [hostType, setHostType] = useState<string>("all"); // 'all', 'remote', 'host'
  const [getParams] = useSearchParams();

  const marketsQuery = useQuery({
    queryKey: ["markets"],
    queryFn: getMarkets,
  });

  const frameworks = useMemo(() => {
    if (!marketsQuery.data) return ["all"];
    const uniqueFrameworks = Array.from(
      new Set(marketsQuery.data.map((market) => market.framework)),
    );
    return ["all", ...uniqueFrameworks];
  }, [marketsQuery.data]);

  const compilers = useMemo(() => {
    if (!marketsQuery.data) return ["all"];
    const uniqueCompilers = Array.from(
      new Set(marketsQuery.data.map((market) => market.compiler).filter(Boolean)),
    );
    return ["all", ...uniqueCompilers];
  }, [marketsQuery.data]);

  const handleCardClick = (slug: string) => {
    if (getParams.get("parentId")) {
      navigate(`/microfrontend/new?template=${slug}&parentId=${getParams.get("parentId")}`);
    } else {
      navigate(`/microfrontend/new?template=${slug}`);
    }
  };

  const handleBlankCardClick = () => {
    navigate("/microfrontend/new");
  };

  const filteredMarkets = useMemo(() => {
    if (!marketsQuery.data) return [];

    return marketsQuery.data.filter((market) => {
      const matchesSearch = market.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFramework =
        selectedFramework === "all" || market.framework === selectedFramework;
      const matchesCompiler = selectedCompiler === "all" || market.compiler === selectedCompiler;
      const matchesHostType =
        hostType === "all" ||
        (hostType === "remote" && market.type === "remote") ||
        (hostType === "host" && market.type === "host");
      return matchesSearch && matchesFramework && matchesCompiler && matchesHostType;
    });
  }, [marketsQuery.data, searchTerm, selectedFramework, selectedCompiler, hostType]);

  const groupedByFramework = useMemo(() => {
    const grouped = filteredMarkets.reduce((acc, market) => {
      if (!acc[market.framework]) {
        acc[market.framework] = [];
      }
      acc[market.framework].push(market);
      return acc;
    }, {} as Record<string, typeof filteredMarkets>);

    return grouped;
  }, [filteredMarkets]);

  const frameworksFetched = Object.keys(groupedByFramework);
  const shouldShowFramework = frameworksFetched.length > 1;

  return (
    <SinglePageLayout
      title={t("market.title")}
      description={t("market.description")}>
      <ApiStatusHandler queries={[marketsQuery]}>
        <div>
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1 md:flex-row md:items-center">
              <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                {frameworks.length > 2 && (
                  <Select
                    value={selectedFramework}
                    onValueChange={setSelectedFramework}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("market.filters.selectFramework")} />
                    </SelectTrigger>
                    <SelectContent>
                      {frameworks.map((framework) => (
                        <SelectItem
                          key={framework}
                          value={framework}>
                          {framework === "all" ? t("market.filters.allFrameworks") : framework}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {compilers.length > 2 && (
                  <Select
                    value={selectedCompiler}
                    onValueChange={setSelectedCompiler}>
                    <SelectTrigger className="min-w-40">
                      <SelectValue placeholder={t("market.filters.selectCompiler")} />
                    </SelectTrigger>
                    <SelectContent>
                      {compilers.map((compiler) => (
                        <SelectItem
                          key={compiler}
                          value={compiler}>
                          {compiler === "all" ? t("market.filters.allCompilers") : compiler}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={hostType}
                  onValueChange={setHostType}>
                  <SelectTrigger className="min-w-28">
                    <SelectValue placeholder={t("market.filters.hostType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("market.filters.allTypes")}</SelectItem>
                    <SelectItem value="remote">{t("market.filters.remote")}</SelectItem>
                    <SelectItem value="host">{t("market.filters.host")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Input
              placeholder={t("market.filters.searchPlaceholder")}
              name="search"
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          {filteredMarkets.length > 0 ||
          (!searchTerm &&
            selectedFramework === "all" &&
            selectedCompiler === "all" &&
            hostType === "all") ? (
            shouldShowFramework ? (
              <div className="space-y-8">
                {/* Show blank card in first framework group if no filters */}
                {!searchTerm &&
                  selectedFramework === "all" &&
                  selectedCompiler === "all" &&
                  hostType === "all" &&
                  frameworksFetched.length > 0 && (
                    <div key="blank-section">
                      <h3 className="text-xl font-semibold mb-4 capitalize">
                        {frameworksFetched[0]}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <BlankTemplateCard onClick={handleBlankCardClick} />
                        {groupedByFramework[frameworksFetched[0]].map((market) => (
                          <TemplateCard
                            key={market._id}
                            market={market}
                            onClick={handleCardClick}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                {/* Show remaining framework groups */}
                {frameworksFetched
                  .slice(
                    !searchTerm &&
                      selectedFramework === "all" &&
                      selectedCompiler === "all" &&
                      hostType === "all"
                      ? 1
                      : 0,
                  )
                  .map((singleFramework) => (
                    <div key={singleFramework}>
                      <h3 className="text-xl font-semibold mb-4 capitalize">{singleFramework}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groupedByFramework[singleFramework].map((market) => (
                          <TemplateCard
                            key={market._id}
                            market={market}
                            onClick={handleCardClick}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Show blank card as first item if no filters */}
                {!searchTerm &&
                  selectedFramework === "all" &&
                  selectedCompiler === "all" &&
                  hostType === "all" && <BlankTemplateCard onClick={handleBlankCardClick} />}
                {filteredMarkets.map((market) => (
                  <TemplateCard
                    key={market._id}
                    market={market}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            )
          ) : (
            <div>
              {/* Show blank card even when no templates available, if no filters are active */}
              {!searchTerm &&
              selectedFramework === "all" &&
              selectedCompiler === "all" &&
              hostType === "all" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  <BlankTemplateCard onClick={handleBlankCardClick} />
                </div>
              ) : null}

              <div className="text-center py-12">
                <div className="text-gray-500 text-lg mb-2">
                  {searchTerm ||
                  selectedFramework !== "all" ||
                  selectedCompiler !== "all" ||
                  hostType !== "all"
                    ? t("market.noResults.title")
                    : t("market.noTemplates.title")}
                </div>
                <p className="text-gray-400">
                  {searchTerm ||
                  selectedFramework !== "all" ||
                  selectedCompiler !== "all" ||
                  hostType !== "all"
                    ? t("market.noResults.description")
                    : t("market.noTemplates.description")}
                </p>
              </div>
            </div>
          )}
        </div>
      </ApiStatusHandler>
    </SinglePageLayout>
  );
};

export default TemplatesLibrary;
