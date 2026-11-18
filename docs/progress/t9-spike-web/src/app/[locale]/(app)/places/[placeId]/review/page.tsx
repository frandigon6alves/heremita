import { getLocale } from 'next-intl/server';

export default async function ReviewPage({ params }: PageProps<'/[locale]/places/[placeId]/review'>) {
  const { placeId } = await params;
  return <h1>review {placeId} in {await getLocale()}</h1>;
}
