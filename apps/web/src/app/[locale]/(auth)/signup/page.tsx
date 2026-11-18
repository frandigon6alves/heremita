import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/features/auth/signup-form';
import { safeNext } from '@/lib/routes';
import { AuthPage } from '../auth-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('metaTitle') };
}

export default async function SignupPage({ searchParams }: PageProps<'/[locale]/signup'>) {
  const t = await getTranslations('auth.signup');
  const next = safeNext((await searchParams).next);

  return (
    <AuthPage title={t('title')} intro={t('intro')}>
      <SignupForm next={next} />
    </AuthPage>
  );
}
