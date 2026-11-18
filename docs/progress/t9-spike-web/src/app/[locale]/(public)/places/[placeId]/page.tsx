import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function PlacePage({ params }: PageProps<'/[locale]/places/[placeId]'>) {
  const { placeId } = await params;
  const t = await getTranslations('common');
  return (
    <main>
      <h1>public place {placeId}</h1>
      <p data-testid="hello">{t('hello')}</p>
      <Link href={`/places/${placeId}/review`}>review</Link>
    </main>
  );
}
