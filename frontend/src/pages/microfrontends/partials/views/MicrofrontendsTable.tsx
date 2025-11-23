import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

export const MicrofrontendsTable: React.FC<{ microfrontends: any[] }> = ({ microfrontends }) => {
  const { t } = useTranslation("platform")
  const navigate = useNavigate()

  return (
    <div className="rounded-md border-2 border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/25">
            <TableHead>{t("common.name")}</TableHead>
            <TableHead>{t("microfrontend.slug")}</TableHead>
            <TableHead>{t("microfrontend.version")}</TableHead>
            <TableHead>{t("microfrontend.canary_release")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {microfrontends.length > 0 ? (
            microfrontends?.map(mfe => {
              const canaryPercentage: number = mfe.canary?.percentage || 0
              return (
                <TableRow key={mfe._id}>
                  <TableCell className="font-medium text-primary">{mfe.name}</TableCell>
                  <TableCell>{mfe.slug}</TableCell>
                  <TableCell>
                    <Badge>{mfe.version}</Badge>
                  </TableCell>
                  <TableCell>
                    {canaryPercentage > 0 ? (
                      <span>
                        {canaryPercentage}% {t("microfrontend.ofUsers")}
                      </span>
                    ) : (
                      <span className="italic text-foreground-secondary">{t("common.no_data")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="primary" size="sm" onClick={() => navigate(`/microfrontend/${mfe._id}`)} className="w-full">
                      {t("common.configuration")}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={100} className="h-24 text-center">
                <span className="text-foreground-secondary">{t("microfrontend.no_microfrontends_found")}</span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default MicrofrontendsTable