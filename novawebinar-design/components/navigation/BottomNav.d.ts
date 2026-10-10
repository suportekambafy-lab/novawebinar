import * as React from 'react';
/** Mobile bottom tab bar — icon + label; active tab is orange with a soft-orange pill behind the icon. */
export interface BottomNavItem { id: string; label: string; icon: string; }
export interface BottomNavProps {
  items: BottomNavItem[];
  value: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}
export declare function BottomNav(props: BottomNavProps): JSX.Element;
