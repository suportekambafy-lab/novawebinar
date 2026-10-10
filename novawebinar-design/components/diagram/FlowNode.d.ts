import * as React from 'react';
/** User-flow diagram node — soft gray rounded rect; highlighted nodes carry a blurred accent glow. */
export interface FlowNodeProps { children: React.ReactNode; highlighted?: boolean; variant?: 'light' | 'white'; style?: React.CSSProperties; }
export declare function FlowNode(props: FlowNodeProps): JSX.Element;
