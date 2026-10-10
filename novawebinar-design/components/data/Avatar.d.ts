import * as React from 'react';
/** Circular photo avatar with a canvas-colored ring; falls back to initials. */
export interface AvatarProps { src?: string; name?: string; size?: number; ring?: boolean; style?: React.CSSProperties; }
export declare function Avatar(props: AvatarProps): JSX.Element;
