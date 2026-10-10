import * as React from 'react';
/** Small file-icon breadcrumb above page titles ("Sales › Teach Products"). */
export interface BreadcrumbItem { label: string; icon?: string; href?: string; onClick?: () => void; }
export interface BreadcrumbProps { items: BreadcrumbItem[]; style?: React.CSSProperties; }
export declare function Breadcrumb(props: BreadcrumbProps): JSX.Element;
