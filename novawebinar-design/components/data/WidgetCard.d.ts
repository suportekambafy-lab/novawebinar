import * as React from 'react';
/**
 * Dashboard widget shell — 32px radius, 24px padding, title + circular action buttons.
 */
export interface WidgetCardAction { icon: string; label?: string; variant?: 'dark' | 'light' | 'white'; size?: number; onClick?: () => void; }
export interface WidgetCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: WidgetCardAction[];
  /** Extra header content left of actions (e.g. a Chip) */
  headerRight?: React.ReactNode;
  variant?: 'default' | 'white' | 'inverse' | 'glass';
  padding?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function WidgetCard(props: WidgetCardProps): JSX.Element;
