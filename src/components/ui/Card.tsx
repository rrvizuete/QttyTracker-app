import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <section className={cn('rounded-panel border border-slate-200 bg-white p-5 shadow-panel', className)}>{children}</section>;
}
