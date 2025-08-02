import { Controller, FieldError, FieldValues, Path, useFormContext } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Textarea } from '../ui/textarea';

type TextFieldProps<T extends FieldValues> = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  name: Path<T>;
  label: string;
  rules?: any;
  textTransform?: (value: string) => string;
  containerClassName?: string;
};

const TextareaField = <T extends FieldValues>({
  name,
  label,
  rules,
  className,
  id,
  containerClassName,
  textTransform,
  ...props
}: TextFieldProps<T>) => {
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
      render={({ field,formState }) => (
        <div className={`grid gap-2 ${containerClassName || ''}`}>
          <Label htmlFor={inputId} className={error ? 'text-destructive' : ''}>
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            disabled={formState.isSubmitting}
            id={inputId}
            className={`${className || ''} ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            {...field}
            {...props}
            onChange={e=>{
              field.onChange(textTransform ? textTransform(e.target.value) : e.target.value)
            }}
            value={field.value || ''}
          />
          {error && (
            <p className="text-sm font-medium text-destructive">
              {error.message}
            </p>
          )}
        </div>
      )}
    />
  );
};

export default TextareaField;