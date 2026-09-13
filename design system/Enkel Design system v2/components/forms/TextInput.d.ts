import * as React from 'react';
/** Hairline-bottom text field with 15px label above. Intentional addition for admin forms. */
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Brick rule + brick message; replaces hint. */
  error?: string;
  multiline?: boolean;
  inputStyle?: React.CSSProperties;
}
export function TextInput(props: TextInputProps): JSX.Element;
