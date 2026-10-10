import * as React from 'react';
/** Overlapping avatars with a black "+N" overflow disc (collaborators in the top bar). */
export interface AvatarStackPerson { src?: string; name?: string; }
export interface AvatarStackProps { people: AvatarStackPerson[]; max?: number; size?: number; overlap?: number; style?: React.CSSProperties; }
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
