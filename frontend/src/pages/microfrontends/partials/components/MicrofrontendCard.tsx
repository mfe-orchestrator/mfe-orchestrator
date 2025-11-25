import { Badge, Button } from "@/components/atoms";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi";
import { Cog, Hammer, UsersRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import BuildDialog from "./BuildDialog";

interface MicrofrontendCardProps {
  mfe: Microfrontend;
}

export const MicrofrontendCard: React.FC<MicrofrontendCardProps> = ({ mfe }) => {
  const { t } = useTranslation("platform");
  const navigate = useNavigate();

  const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false);

  const isCanary = mfe?.canary?.enabled;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-row items-end justify-between flex-wrap-reverse">
        <div>
          <CardTitle className="mb-0">{mfe.name}</CardTitle>
          <div className="text-sm text-foreground-secondary">{mfe.slug}</div>
        </div>
        <Badge>{mfe.version}</Badge>
      </CardHeader>
      <CardContent className="flex-grow py-3 flex flex-col gap-2">
        <div className="text-foreground-secondary flex flex-row">
          <div className="font-medium mr-1">{t("microfrontend.host")}:</div>
          <div>
            {mfe.host.type === "CUSTOM_URL" && t("microfrontend.hostTypes.customUrl")}
            {mfe.host.type === "MFE_ORCHESTRATOR_HUB" &&
              t("microfrontend.hostTypes.mfeOrchestratorHub")}
            {mfe.host.type === "CUSTOM_SOURCE" && t("microfrontend.hostTypes.customSource")}
          </div>
        </div>
        {isCanary && (
          <div className="mt-2 p-3 bg-muted/30 rounded-md border border-muted-foreground/20">
            <div className="flex items-center gap-2 text-primary font-semibold mb-2">
              <UsersRound size="1.1rem" />
              <span>{t("microfrontend.canaryReleaseActive")}</span>
            </div>
            <div className="grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-secondary">{t("microfrontend.distribution")}</span>
                <span className="font-medium">
                  {t("microfrontend.usersPercentage", { percentage: mfe.canary.percentage })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-secondary">{t("microfrontend.type")}</span>
                <span className="font-medium">
                  {mfe.canary.type === "ON_SESSIONS" && t("microfrontend.sessionType")}
                  {mfe.canary.type === "ON_USER" && t("microfrontend.userType")}
                  {mfe.canary.type === "COOKIE_BASED" && t("microfrontend.cookieBasedType")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-secondary">{t("microfrontend.deployment")}:</span>
                <span className="font-medium">
                  {mfe.canary.deploymentType === "BASED_ON_VERSION" &&
                    t("microfrontend.deploymentTypes.basedOnVersion")}
                  {mfe.canary.deploymentType === "BASED_ON_URL" &&
                    t("microfrontend.deploymentTypes.basedOnUrl")}
                </span>
              </div>
              {mfe.canary.url && (
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">{t("microfrontend.canaryUrl")}:</span>
                  <span
                    className="font-medium truncate max-w-[200px]"
                    title={mfe.canary.url}>
                    {mfe.canary.url}
                  </span>
                </div>
              )}
              {mfe.canary.version && (
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">
                    {t("microfrontend.canaryVersion")}:
                  </span>
                  <span className="font-medium">{mfe.canary.version}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2 flex-wrap">
        <Button
          variant="primary"
          onClick={() => navigate(`/microfrontend/${mfe._id}`)}
          className="flex-1">
          <Cog />
          {t("common.configuration")}
        </Button>
        {mfe.codeRepository?.enabled && (
          <Button
            variant="secondary"
            onClick={() => setIsBuildDialogOpen(true)}
            className="flex-1">
            <Hammer />
            {t("microfrontend.card.build")}
          </Button>
        )}
      </CardFooter>

      <BuildDialog
        open={isBuildDialogOpen}
        onOpenChange={setIsBuildDialogOpen}
        microfrontendId={mfe._id}
        microfrontendName={mfe.name}
      />
    </Card>
  );
};

export default MicrofrontendCard;
