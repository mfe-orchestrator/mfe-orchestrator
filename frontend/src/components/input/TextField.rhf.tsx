import React, { InputHTMLAttributes } from 'react';
import { Controller, FieldError, FieldValues, Path, useFormContext } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type TextFieldProps<T extends FieldValues> = InputHTMLAttributes<HTMLInputElement> & {
  name: Path<T>;
  label: string;
  rules?: any;
};

const TextField = <T extends FieldValues>({
  name,
  label,
  rules,
  className,
  ...props
}: TextFieldProps<T>) => {
  const {
    control,
    formState: { errors }
  } = useFormContext<T>();
  
  const error = errors[name] as FieldError | undefined;
  const inputId = `${name}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field,formState }) => (
        <div className="grid gap-2">
          <Label htmlFor={inputId} className={error ? 'text-destructive' : ''}>
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            disabled={formState.isSubmitting}
            id={inputId}
            className={`${className || ''} ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            {...field}
            {...props}
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

export default TextField;