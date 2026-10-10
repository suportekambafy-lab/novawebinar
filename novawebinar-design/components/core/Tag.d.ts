import * as React from 'react';
/** Small accent value tag — chart callouts ("+9%", "12,464") and status labels. */
export interface TagProps {
  children: React.ReactNode;
  variant?: 'accent' | 'soft' | 'dark' | 'gray';
  size?: 'sm' | 'md';
  /** Fully rounded instead of 6px */
  pill?: boolean;
  style?: React.CSSProperties;
}
export declare function Tag(props: TagProps): JSX.Element;
