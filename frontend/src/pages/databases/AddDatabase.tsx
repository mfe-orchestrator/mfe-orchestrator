import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SwitchField as Switch } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { Key, Settings } from "lucide-react"
import React, { useEffect, useMemo, useRef } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useDatabaseApi, { Database, DatabaseDTO, DatabaseType, DEFAULT_DATABASE_PORT } from "@/hooks/apiClients/useDatabaseApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface DatabaseFormProps {
    initialData?: Database
    id?: string
    onDone: () => void
}

const DatabaseForm: React.FC<DatabaseFormProps> = ({ initialData, id, onDone }) => {
    const { t } = useTranslation()
    const databaseApi = useDatabaseApi()
    const notifications = useToastNotificationStore()

    const form = useForm<DatabaseDTO>({
        defaultValues: initialData ?? {
            type: DatabaseType.POSTGRESQL,
            connection: { authType: "credentials", port: DEFAULT_DATABASE_PORT[DatabaseType.POSTGRESQL], ssl: true }
        }
    })

    const type = form.watch("type")
    const authType = form.watch("connection.authType")

    // La porta segue il motore finche' e' quella predefinita del motore precedente, o e' vuota perche' si arriva
    // dalla stringa di connessione: una porta scelta a mano resta
    const previousType = useRef(type)
    useEffect(() => {
        const port = form.getValues("connection.port")
        if (authType === "credentials" && (!port || Number(port) === DEFAULT_DATABASE_PORT[previousType.current])) {
            form.setValue("connection.port", DEFAULT_DATABASE_PORT[type])
        }
        previousType.current = type
    }, [type, authType, form])

    const onSubmit = async (data: DatabaseDTO) => {
        if (id) {
            await databaseApi.update(id, data)
            notifications.showSuccessNotification({ message: t("database.updateSuccess") })
        } else {
            await databaseApi.create(data)
            notifications.showSuccessNotification({ message: t("database.createSuccess") })
        }
        onDone()
    }

    const databaseTypes = useMemo(() => Object.values(DatabaseType).map(value => ({ value, label: t(`database.types.${value}`) })), [t])

    const authTypes = [
        { value: "credentials", label: t("database.authTypes.credentials") },
        { value: "connectionString", label: t("database.authTypes.connectionString") }
    ]

    const required = { required: t("validation.required") }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>{t("database.basicInformation")}</CardTitle>
                        </div>
                        <CardDescription>{t("database.basicInformationDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextField name="name" dataTestId="database-name" label={t("database.name")} placeholder={t("database.namePlaceholder")} rules={required} />
                            <SelectField name="type" label={t("database.type")} options={databaseTypes} rules={required} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Key className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>{t("database.connection")}</CardTitle>
                        </div>
                        <CardDescription>{t("database.connectionDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <SelectField name="connection.authType" label={t("database.fields.authType")} options={authTypes} rules={required} />

                        {authType === "credentials" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextField name="connection.host" dataTestId="database-host" label={t("database.fields.host")} placeholder="db.example.com" rules={required} />
                                <TextField
                                    name="connection.port"
                                    dataTestId="database-port"
                                    type="number"
                                    label={t("database.fields.port")}
                                    rules={{ ...required, min: { value: 1, message: t("database.portInvalid") }, max: { value: 65535, message: t("database.portInvalid") } }}
                                />
                                <TextField name="connection.database" dataTestId="database-database" label={t("database.fields.database")} rules={required} />
                                <TextField name="connection.username" dataTestId="database-username" label={t("database.fields.username")} autoComplete="off" rules={required} />
                                {/* Non e' un login: i password manager non devono riempirli con le credenziali della console */}
                                <TextField
                                    name="connection.password"
                                    dataTestId="database-password"
                                    type="password"
                                    autoComplete="new-password"
                                    label={t("database.fields.password")}
                                    rules={required}
                                />
                                <div className="flex items-end pb-2">
                                    <Switch name="connection.ssl" label={t("database.fields.ssl")} />
                                </div>
                            </div>
                        )}

                        {authType === "connectionString" && (
                            <TextField
                                name="connection.connectionString"
                                dataTestId="database-connection-string"
                                type="password"
                                autoComplete="new-password"
                                label={t("database.fields.connectionString")}
                                placeholder={t("database.connectionStringPlaceholder")}
                                rules={required}
                            />
                        )}
                    </CardContent>
                </Card>

                <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                        <strong>{t("database.securityNotice")}</strong> {t("database.securityNoticeDescription")}
                    </AlertDescription>
                </Alert>

                <div className="flex justify-end space-x-4 pt-4">
                    <Button type="button" variant="secondary" onClick={onDone} dataTestId="database-cancel">
                        {t("common.cancel")}
                    </Button>
                    <Button type="submit" dataTestId="database-submit" disabled={form.formState.isSubmitting}>
                        {id ? t("common.update") : t("common.create")}
                    </Button>
                </div>
            </form>
        </FormProvider>
    )
}

export const AddDatabase = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { id } = useParams<{ id?: string }>()
    const databaseApi = useDatabaseApi()

    const databaseQuery = useQuery({
        queryKey: ["database", id],
        queryFn: () => databaseApi.getSingle(id!),
        enabled: Boolean(id)
    })

    const handleDone = () => navigate("/databases")

    return (
        <SinglePageLayout title={id ? t("database.editDatabase") : t("database.newDatabase")} description={id ? t("database.editDatabaseDescription") : t("database.newDatabaseDescription")}>
            {id ? (
                <ApiStatusHandler queries={[databaseQuery]}>
                    <DatabaseForm initialData={databaseQuery.data} id={id} onDone={handleDone} />
                </ApiStatusHandler>
            ) : (
                <DatabaseForm onDone={handleDone} />
            )}
        </SinglePageLayout>
    )
}

export default AddDatabase
