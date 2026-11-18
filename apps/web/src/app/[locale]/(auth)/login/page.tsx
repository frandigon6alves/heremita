import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/features/auth/login-form';
import { safeNext } from '@/lib/routes';
import { AuthPage } from '../auth-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

export default async function LoginPage({ searchParams }: PageProps<'/[locale]/login'>) {
  const t = await getTranslations('auth.login');
  const next = safeNext((await searchParams).next);

  return (
    <AuthPage title={t('title')}>
      <LoginForm next={next} />
    </AuthPage>
  );
}
