export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <div data-testid="app-gate">{children}</div>;
}
