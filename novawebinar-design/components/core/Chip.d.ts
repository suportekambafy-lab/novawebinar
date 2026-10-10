import * as React from 'react';
/** Static pill for dates, periods and filters; optional caption line, leading icon disc and trailing white knob. */
export interface ChipProps {
  label: React.ReactNode;
  /** Small caption above label (e.g. "Date") */
  caption?: string;
  /** Leading Lucide icon in a disc */
  icon?: string;
  /** Trailing white circle knob (filter pills in Analytics) */
  knob?: boolean;
  variant?: 'light' | 'white' | 'chip' | 'dark';
  size?: 'sm' | 'md';
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Chip(props: ChipProps): JSX.Element;
