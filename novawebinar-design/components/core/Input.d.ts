import * as React from 'react';
/** Pill text/search input. Intentional addition — no text field appears in the source, only a search action. */
export interface InputProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Leading Lucide icon, default "search" */
  icon?: string | null;
  variant?: 'light' | 'white';
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
