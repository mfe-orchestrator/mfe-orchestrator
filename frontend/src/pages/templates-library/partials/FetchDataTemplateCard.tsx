import { useQuery } from "@tanstack/react-query";
import TemplateCard from "./TemplateCard";
import useMarketApi from "@/hooks/apiClients/useMarketApi";
import { ApiStatusHandler } from "@/components/organisms";

interface FetchDataTemplateCardProps {
  slug: string;
  onClick?: (slug: string) => void;
}

export const FetchDataTemplateCard: React.FC<FetchDataTemplateCardProps> = ({ slug, onClick }) => {
  const { getMarketBySlug } = useMarketApi();

  const marketQuery = useQuery({
    queryKey: ["market", slug],
    queryFn: () => getMarketBySlug(slug),
    enabled: !!slug, // Only run query if slug is provided
  });

  if (!slug) return <></>;

  return (
    <ApiStatusHandler queries={[marketQuery]}>
      {marketQuery.data ? (
        <TemplateCard
          market={marketQuery.data}
          onClick={onClick}
        />
      ) : (
        <></>
      )}
    </ApiStatusHandler>
  );
};

export default FetchDataTemplateCard;
