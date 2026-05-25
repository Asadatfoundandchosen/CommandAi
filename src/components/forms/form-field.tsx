import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type TextFormFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  type?: string;
};

/** Reusable text input bound to react-hook-form. */
export function TextFormField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  type = 'text',
}: TextFormFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} placeholder={placeholder} {...field} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type FormActionsProps = {
  children: ReactNode;
};

export function FormActions({ children }: FormActionsProps) {
  return <div className="flex justify-end gap-2 pt-2">{children}</div>;
}
