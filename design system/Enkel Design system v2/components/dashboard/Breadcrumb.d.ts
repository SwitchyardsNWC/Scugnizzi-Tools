import * as React from 'react';
export interface BreadcrumbItem { label: React.ReactNode; href?: string; onClick?: () => void; }
/** Trail back up from a drill-down page: "Overview › Clubs › Ponce City". 13px, graphite links, ink current item, › separators. */
export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> { items: BreadcrumbItem[]; }
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
