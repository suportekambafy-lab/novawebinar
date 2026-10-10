import * as React from 'react';
/** Thin smooth line with black point dots and a accent tag on the highlighted point. */
export interface LineChartProps {
  labels?: string[];
  values: number[];
  highlight?: number;
  tag?: React.ReactNode;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}
export declare function LineChart(props: LineChartProps): JSX.Element;
