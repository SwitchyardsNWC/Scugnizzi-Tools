import * as React from 'react';
/** Native select styled as a hairline field. Intentional addition for admin forms. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: Array<string | { value: string; label: string }>;
}
export function Select(props: SelectProps): JSX.Element;
