import * as React from 'react';
/** Lucide outline icon (CDN, stroke 1.5) rendered inline so it inherits currentColor. */
export interface IconProps {
  /** Lucide icon name, kebab-case (e.g. "arrow-up-right", "sliders-vertical"). */
  name: string;
  /** Pixel size. Default 18. */
  size?: number;
  /** Stroke width. Default 1.5 (Novawebinar's thin line). */
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
