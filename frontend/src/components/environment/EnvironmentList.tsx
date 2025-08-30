import { FormProvider, useForm } from "react-hook-form"
import { useEffect, useState } from "react"
import { Button } from "../ui/button/button"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import TextField from "../input/TextField.rhf"
import Switch from "../input/Switch.rhf"
import ColorPicker from "../input/ColorPicker.rhf"
import { Loader2, PencilIcon, TrashIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { getRandomColor } from "@/utils/StringUtils"

interface EnvironmentListProps {
    environments: EnvironmentDTO[]
    onSaveEnvironments: (environments: EnvironmentDTO[]) => Promise<void>
}

interface SingleEnviromentEditProps {
    environment: EnvironmentDTO
    onCancelEdit: () => void
    onSubmit: (environment: EnvironmentDTO) => void
}

interface SingleEnviromentSeeProps {
    environment: EnvironmentDTO
    onDelete: () => void
    onEdit: () => void
    disableIcons?: boolean
}

const SingleEnviromentSee: React.FC<SingleEnviromentSeeProps> = ({ environment, onDelete, onEdit, disableIcons }) => {
    const { t } = useTranslation()
    return (
        <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <div className="flex items-center space-x-4">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: environment.color }} title={t("environment.color_tooltip", { name: environment.name })} />
                <div className="min-w-0">
                    <div className="flex items-baseline space-x-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{environment.name}</span>
                        <span className="text-xs text-gray-500">({environment.slug})</span>
                    </div>
                    {environment.description && <p className="text-xs text-gray-500 truncate">{environment.description}</p>}
                </div>
            </div>

            <div className="flex items-center space-x-3">
                {environment.isProduction && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{t("environment.production")}</span>}
                <div className="flex items-center space-x-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onEdit}
                        className={`p-1.5 rounded-md transition-all duration-200 ${
                            disableIcons ? "text-gray-300 cursor-not-allowed" : "text-blue-600 hover:bg-blue-50 hover:text-blue-700 hover:shadow-sm"
                        }`}
                        disabled={disableIcons}
                        title={t("environment.edit_title")}
                    >
                        <PencilIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDelete}
                        className={`p-1.5 rounded-md transition-all duration-200 ${
                            disableIcons ? "text-gray-300 cursor-not-allowed" : "text-red-600 hover:bg-red-50 hover:text-red-700 hover:shadow-sm"
                        }`}
                        disabled={disableIcons}
                        title={t("environment.delete_title")}
                    >
                        <TrashIcon className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
const SingleEnviromentEdit: React.FC<SingleEnviromentEditProps> = ({ environment, onSubmit, onCancelEdit }) => {
    const { t } = useTranslation()
    const form = useForm<EnvironmentDTO>({
        defaultValues: environment
    })

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextField
                                name="name"
                                label={t("environment.form.name")}
                                placeholder={t("environment.form.name_placeholder")}
                                rules={{ required: t("environment.form.name_required") }}
                                required
                                containerClassName="md:col-span-2"
                            />
                            <TextField
                                name="slug"
                                label={t("environment.form.slug")}
                                placeholder={t("environment.form.slug_placeholder")}
                                textTransform={e => e?.toUpperCase()}
                                rules={{ required: t("environment.form.slug_required") }}
                                required
                                containerClassName="md:col-span-2"
                            />
                            <TextField name="description" label={t("environment.form.description")} placeholder={t("environment.form.description_placeholder")} containerClassName="md:col-span-2" />
                            <div className="flex items-center space-x-4">
                                <Switch name="isProduction" label={t("environment.form.is_production")} className="flex-1" />
                                <div className="flex-1">
                                    <ColorPicker name="color" label={t("environment.form.color")} />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onCancelEdit}
                                className="border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded-md shadow-sm hover:shadow transition-all duration-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                {t("common.cancel")}
                            </Button>
                            <Button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                {t("common.save_changes")}
                            </Button>
                        </div>
                    </div>
                </form>
            </FormProvider>
        </div>
    )
}

const EnvironmentList: React.FC<EnvironmentListProps> = ({ environments, onSaveEnvironments }) => {
    const { t } = useTranslation()
    const [editingId, setEditingId] = useState<string | number>()
    const [loading, setLoading] = useState(false)
    const [environmentList, setEnvironmentList] = useState(environments)

    useEffect(() => {
        setEnvironmentList(environments)
    }, [environments])

    const onAddEnvironment = () => {
        const newEnvironment = {
            color: getRandomColor()
        } as EnvironmentDTO

        if (!environmentList) {
            setEnvironmentList([newEnvironment])
            setEditingId(0)
        } else {
            const newList = [...environmentList, newEnvironment]
            setEnvironmentList(newList)
            setEditingId(newList.length - 1)
        }
    }

    const onEditSingle = (index: number) => () => {
        setEditingId(index)
    }

    const onDeleteSingle = (index: number) => () => {
        const value = environmentList || []
        const newData = value.filter((_, i) => i !== index)
        setEnvironmentList(newData)
    }

    const onSaveEnvironment = (index: number) => (environment: EnvironmentDTO) => {
        const value = environmentList || []
        const newData = value.map((env, i) => (i === index ? environment : env))
        setEnvironmentList(newData)
        setEditingId(undefined)
    }

    const onCancelSingle = (index: number) => () => {
        setEditingId(undefined)
    }

    const onSaveEnvironmentWrapper = async () => {
        setLoading(true)
        await onSaveEnvironments(environmentList)
        setLoading(false)
    }

    return (
        <div className="mt-8">
            {loading ? (
                <Loader2 className="animate-spin" />
            ) : (
                <>
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-sm font-medium text-gray-900">{t("environment.your_environments")}</h4>
                        {environmentList && environmentList.length !== 0 && (
                            <Button
                                onClick={onSaveEnvironmentWrapper}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                {t("common.save")}
                            </Button>
                        )}
                    </div>
                    {environmentList && (
                        <ul className="bg-white shadow overflow-hidden rounded-md divide-y divide-gray-200">
                            {environmentList.map((env, index) => {
                                const key = env._id || index
                                const isEditing = key === editingId
                                return (
                                    <li key={key} className="px-4 py-4">
                                        {isEditing ? (
                                            <SingleEnviromentEdit environment={env} onSubmit={onSaveEnvironment(index)} onCancelEdit={onCancelSingle(index)} />
                                        ) : (
                                            <SingleEnviromentSee environment={env} onDelete={onDeleteSingle(index)} onEdit={onEditSingle(index)} disableIcons={Boolean(editingId)} />
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    <div className="flex justify-center mt-4">
                        <Button
                            onClick={onAddEnvironment}
                            disabled={editingId !== undefined}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            {t("environment.add_environment")}
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}

export default EnvironmentList
