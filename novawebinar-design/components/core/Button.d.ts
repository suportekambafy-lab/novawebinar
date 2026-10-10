import * as React from 'react';
/**
 * Pill button. Accent (orange, white text) = primary action, light/white = secondary on canvas/cards, dark = secondary on light surfaces.
 */
export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'dark' | 'light' | 'white' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  /** Leading Lucide icon name */
  icon?: string;
  /** Trailing Lucide icon name (e.g. "arrow-up-right" on "Export as CVS") */
  iconRight?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
