import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"

export interface PageHeadProps {
    /** Page name, already translated. When omitted the document keeps the bare app name. */
    title?: string
    /** Page description, already translated. Overrides the static meta description of index.html. */
    description?: string
}

/**
 * Fills the document head for a single page: title, meta description and their Open Graph twins.
 * The layouts (SinglePageLayout, AuthenticationLayout) render it from the title they already
 * receive, so most pages get their head for free; standalone screens mount it themselves.
 */
const PageHead: React.FC<PageHeadProps> = ({ title, description }) => {
    const { t } = useTranslation()
    const appName = t("app.name")
    const documentTitle = title ? t("app.page_title", { page: title, app: appName }) : appName

    return (
        <Helmet>
            <title>{documentTitle}</title>
            <meta property="og:title" content={documentTitle} />
            {description ? <meta name="description" content={description} /> : null}
            {description ? <meta property="og:description" content={description} /> : null}
        </Helmet>
    )
}

export default PageHead
