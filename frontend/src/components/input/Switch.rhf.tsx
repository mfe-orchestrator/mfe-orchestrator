import { SwitchProps } from "@radix-ui/react-switch";
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { Label } from "../ui/label";
import { Switch as UISwitch } from "../ui/switch";

type SwitchCustomProps<T extends FieldValues> = SwitchProps & {
    name: Path<T>
    label?: string
    rules?: Omit<RegisterOptions<T, string & Path<T>>, "disabled" | "setValueAs" | "valueAsNumber" | "valueAsDate">
}


const Switch = <T extends FieldValues>({
    id,
    name,
    label,
    rules,
    required,
    className,
    ...otherProps
} : SwitchCustomProps<T>) =>{

    const {
        control,
        formState: { errors }
      } = useFormContext<T>();
      
      const error = errors[name] as FieldError | undefined;
      const inputId = name || id;
    
      return (
          <Controller
              name={name}
              control={control}
              rules={rules}
              render={({ field, formState }) => (
                  <div className="grid gap-1">
                      {label && (
                          <Label htmlFor={inputId} className={error ? "text-destructive" : ""}>
                              {label}
                              {required && <span className="text-destructive ml-1">*</span>}
                          </Label>
                      )}
                      <UISwitch
                          disabled={formState.isSubmitting}
                          id={inputId}
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className={`${className || ""} ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          {...field}
                          {...otherProps}
                      />
                      {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                  </div>
              )}
          />
      )
}

export default Switch