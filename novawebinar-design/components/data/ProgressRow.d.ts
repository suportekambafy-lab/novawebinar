import * as React from 'react';
/** Labelled percentage bar (Virtual Cards: "Dolar 72%"). */
export interface ProgressRowProps {
  label: string;
  /** 0–100 */
  value: number;
  /** Optional leading count ("34 Wallets") */
  count?: number;
  style?: React.CSSProperties;
}
export declare function ProgressRow(props: ProgressRowProps): JSX.Element;
