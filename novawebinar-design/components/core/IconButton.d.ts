import * as React from 'react';
/** Circular icon-only button — card actions, toolbar tools, side rail. */
export interface IconButtonProps {
  /** Lucide icon name */
  icon: string;
  variant?: 'dark' | 'light' | 'white' | 'accent' | 'ghost';
  /** Diameter in px. Default 40. */
  size?: number;
  /** Accessible label / tooltip */
  label?: string;
  /** Forces the accent (selected) treatment */
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
