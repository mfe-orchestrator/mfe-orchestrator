import { Badge, Button } from "@/components/atoms";
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi";
import { getRandomColor } from "@/utils/StringUtils";
import { Loader2, PencilIcon, PlusCircle, Save, TrashIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import ColorPicker from "../../../components/input/ColorPicker.rhf";
import Switch from "../../../components/input/Switch.rhf";
import TextareaField from "../../../components/input/TextareaField.rhf";
import TextField from "../../../components/input/TextField.rhf";
import { Card } from "../../../components/ui/card";

interface EnvironmentListProps {
  environments: EnvironmentDTO[];
  onSaveEnvironments: (environments: EnvironmentDTO[]) => Promise<void>;
}

interface SingleEnviromentEditProps {
  environment: EnvironmentDTO;
  onCancelEdit: () => void;
  onSubmit: (environment: EnvironmentDTO) => void;
}

interface SingleEnviromentSeeProps {
  environment: EnvironmentDTO;
  onDelete: () => void;
  onEdit: () => void;
  disableIcons?: boolean;
}

const SingleEnviromentSee: React.FC<SingleEnviromentSeeProps> = ({
  environment,
  onDelete,
  onEdit,
  disableIcons,
}) => {
  const { t } = useTranslation();
  return (
    <Card className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4">
        <div
          className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-border"
          style={{ backgroundColor: environment.color }}
          title={t("environment.color_tooltip", { name: environment.name })}
        />
        <div>
          <div className="flex items-baseline gap-2">
            <h4 className="font-medium text-foreground">{environment.name}</h4>
            <span className="text-sm text-foreground-secondary">{environment.slug}</span>
          </div>
          {environment.description && (
            <p className="text-sm text-foreground-secondary">{environment.description}</p>
          )}
        </div>
        {environment.isProduction && <Badge variant="accent">{t("environment.production")}</Badge>}
      </div>

      <div className="flex items-center gap-1 ms-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          disabled={disableIcons}
          title={t("environment.edit_title")}>
          <PencilIcon />
        </Button>
        <Button
          variant="ghost-destructive"
          size="icon"
          onClick={onDelete}
          disabled={disableIcons}
          title={t("environment.delete_title")}>
          <TrashIcon />
        </Button>
      </div>
    </Card>
  );
};
const SingleEnviromentEdit: React.FC<SingleEnviromentEditProps> = ({
  environment,
  onSubmit,
  onCancelEdit,
}) => {
  const { t } = useTranslation();
  const form = useForm<EnvironmentDTO>({
    defaultValues: environment,
  });

  return (
    <div className="p-3 bg-primary/15 rounded-lg border-2 border-border">
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
                onChange={(e) => {
                  const slug = e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, "-");
                  console.log(slug, e.target.value, e.target.value.toUpperCase());
                  form.setValue("slug", slug);
                }}
              />
              <TextField
                name="slug"
                label={t("environment.form.slug")}
                placeholder={t("environment.form.slug_placeholder")}
                textTransform={(e) => e?.toUpperCase()}
                rules={{ required: t("environment.form.slug_required") }}
                required
                containerClassName="md:col-span-2"
              />
              <TextareaField
                name="description"
                label={t("environment.form.description")}
                placeholder={t("environment.form.description_placeholder")}
                containerClassName="md:col-span-2"
              />
              <div className="flex items-center space-x-4">
                <Switch
                  name="isProduction"
                  label={t("environment.form.is_production")}
                  className="flex-1"
                />
                <div className="flex-1">
                  <ColorPicker
                    name="color"
                    label={t("environment.form.color")}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancelEdit}>
                <X />
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary">
                <PlusCircle />
                {t("common.add")}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};

export const EnvironmentList: React.FC<EnvironmentListProps> = ({
  environments,
  onSaveEnvironments,
}) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | number>();
  const [loading, setLoading] = useState(false);
  const [environmentList, setEnvironmentList] = useState(environments);

  useEffect(() => {
    if (!environments) return;
    const newEnv = [...environments];
    newEnv.forEach((env, index) => {
      env.order = index;
    });
    setEnvironmentList(newEnv);
  }, [environments]);

  const onAddEnvironment = () => {
    const newEnvironment = {
      color: getRandomColor(),
      order: environmentList?.length || 0,
    } as EnvironmentDTO;

    if (!environmentList) {
      setEnvironmentList([newEnvironment]);
      setEditingId(0);
    } else {
      const newList = [...environmentList, newEnvironment];
      setEnvironmentList(newList);
      setEditingId(newList.length - 1);
    }
  };

  const onEditSingle = (index: number) => () => {
    setEditingId(index);
  };

  const onDeleteSingle = (index: number) => () => {
    const value = environmentList || [];
    const newData = value.filter((_, i) => i !== index);
    setEnvironmentList(newData);
  };

  const onSaveEnvironment = (index: number) => (environment: EnvironmentDTO) => {
    const value = environmentList || [];
    const newData = value.map((env, i) => (i === index ? environment : env));
    setEnvironmentList(newData);
    setEditingId(undefined);
  };

  const onCancelSingle = (index: number) => () => {
    setEditingId(undefined);
  };

  const onSaveEnvironmentWrapper = async () => {
    setLoading(true);
    await onSaveEnvironments(environmentList);
    setLoading(false);
  };

  return (
    <div className="mt-8">
      {loading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <>
          <h3 className="text-sm font-medium uppercase text-foreground-secondary tracking-wide mb-2">
            {t("environment.your_environments")}
          </h3>
          {environmentList && (
            <ul>
              {environmentList.map((env, index) => {
                const key = env._id || index;
                const isEditing = key === editingId;
                return (
                  <li
                    key={key}
                    className="mb-2 last:mb-0">
                    {isEditing ? (
                      <SingleEnviromentEdit
                        environment={env}
                        onSubmit={onSaveEnvironment(index)}
                        onCancelEdit={onCancelSingle(index)}
                      />
                    ) : (
                      <SingleEnviromentSee
                        environment={env}
                        onDelete={onDeleteSingle(index)}
                        onEdit={onEditSingle(index)}
                        disableIcons={Boolean(editingId)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {editingId === undefined && (
            <div className="flex justify-start gap-2 mt-4">
              <Button
                onClick={onAddEnvironment}
                disabled={editingId !== undefined}
                variant="secondary">
                <PlusCircle />
                {t("environment.add_environment")}
              </Button>
            </div>
          )}
          {environmentList && environmentList.length !== 0 && (
            <div className="flex justify-end gap-2 mt-4">
              <Button
                onClick={onSaveEnvironmentWrapper}
                disabled={loading}
                variant="primary">
                <Save />
                {t("common.save")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EnvironmentList;
