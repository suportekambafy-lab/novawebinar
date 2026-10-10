import * as React from 'react';
/** Grid of rounded squares shaded along the accent scale (0 = hatched empty, 1–4 = accent tints, null = gap). */
export interface HeatmapRow { label: string; lines: (number | null)[][]; }
export interface HeatmapProps { rows: HeatmapRow[]; cell?: number; gap?: number; labelWidth?: number; style?: React.CSSProperties; }
export declare function Heatmap(props: HeatmapProps): JSX.Element;
