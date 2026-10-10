import * as React from 'react';
/** Large light-tracked number with optional currency prefix, small unit suffix, caption and sub-line. */
export interface MetricProps {
  value: React.ReactNode;
  /** Superscript-ish prefix, e.g. "$" */
  prefix?: string;
  /** Small suffix, e.g. "m", "k" */
  unit?: string;
  caption?: React.ReactNode;
  sub?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  inverse?: boolean;
  style?: React.CSSProperties;
}
export declare function Metric(props: MetricProps): JSX.Element;
