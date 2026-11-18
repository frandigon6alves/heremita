import type { Metadata } from 'next';
import { ViewerGate } from '@/features/auth/viewer-gate';

export const metadata: Metadata = { robots: { index: false } };

/** Members-only pages. Each page renders its own chrome (the planner has its own app bar). */
export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <ViewerGate>{children}</ViewerGate>;
}
