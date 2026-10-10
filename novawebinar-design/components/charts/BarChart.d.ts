import * as React from 'react';
/** Rounded gray bars; the highlighted bar is diagonally hatched with a accent value tag above. */
export interface BarChartDatum { label: string; value: number; }
export interface BarChartProps {
  data: BarChartDatum[];
  /** Index of the hatched bar */
  highlight?: number;
  /** Accent tag text above highlighted bar */
  tag?: React.ReactNode;
  height?: number;
  barRadius?: number;
  gap?: number;
  showLabels?: boolean;
  style?: React.CSSProperties;
}
export declare function BarChart(props: BarChartProps): JSX.Element;
