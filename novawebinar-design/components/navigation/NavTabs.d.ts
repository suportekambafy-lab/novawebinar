import * as React from 'react';
/**
 * Top-level product navigation — separate pills with icons; the active pill is orange.
 */
export interface NavTabsItem { id: string; label: string; icon?: string; }
export interface NavTabsProps {
  items: NavTabsItem[];
  value: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}
export declare function NavTabs(props: NavTabsProps): JSX.Element;
