import * as React from 'react';
/** Vertical stack of white circular icon buttons on the page's left edge; active item is orange. */
export interface SideRailItem { id: string; icon: string; label?: string; }
export interface SideRailProps {
  items: SideRailItem[];
  value?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}
export declare function SideRail(props: SideRailProps): JSX.Element;
