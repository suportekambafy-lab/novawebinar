import * as React from 'react';
/** Hatched band between two series (year-over-year comparison) with a accent delta tag. */
export interface RangeChartProps {
  labels?: string[];
  upper: number[];
  lower: number[];
  upperLabel?: string;
  lowerLabel?: string;
  highlight?: number;
  tag?: React.ReactNode;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}
export declare function RangeChart(props: RangeChartProps): JSX.Element;
