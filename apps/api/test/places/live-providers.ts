// `pnpm --filter @heremita/api test:live`: one real request per geocoding
// provider, with the real User-Agent and Referer, to confirm the adapters still
// match the live services. Manual only: never in CI, never in `pnpm test`.
// Nominatim is called only when NOMINATIM_ENABLED=true (OSMF policy).
import { Logger } from '@nestjs/common';
import { parseEnv } from '../../src/config/env.js';
import { SystemClock } from '../../src/core/clock/system-clock.js';
import type { PlaceResult } from '../../src/providers/core/contract.js';
import { OutboundClient } from '../../src/providers/core/outbound.js';
import { NominatimGeocoder } from '../../src/providers/nominatim/nominatim.geocoder.js';
import { PhotonGeocoder } from '../../src/providers/photon/photon.geocoder.js';

const env = parseEnv(process.env);
const logger = new Logger('test:live');
const outbound = new OutboundClient({
  publicSiteUrl: env.PUBLIC_SITE_URL,
  clock: new SystemClock(),
  logger,
});
const noCache = { remember: <T>(_key: string, _schema: unknown, load: () => Promise<T>) => load() };

function report(provider: string, places: readonly PlaceResult[]): void {
  const first = places[0];
  const line = first ? `${first.key} ${first.name} (${first.category})` : 'no result';
  process.stdout.write(`${provider}: ${places.length} result(s); first: ${line}\n`);
}

async function main(): Promise<void> {
  if (!env.PHOTON_URL) {
    throw new Error('Set PHOTON_URL to run the live check');
  }
  const photon = new PhotonGeocoder({ photonUrl: env.PHOTON_URL, outbound, cache: noCache });
  report(
    'photon search',
    await photon.search({
      text: 'Museu de Arte de São Paulo',
      locale: 'pt-BR',
      intent: 'submit',
      limit: 3,
    }),
  );

  if (!env.NOMINATIM_ENABLED || !env.NOMINATIM_URL) {
    process.stdout.write('nominatim: skipped (NOMINATIM_ENABLED is not true)\n');
    return;
  }
  const nominatim = new NominatimGeocoder({
    nominatimUrl: env.NOMINATIM_URL,
    outbound,
    cache: noCache,
  });
  report('nominatim lookup', await nominatim.lookup(['osm:W:1370081491'], 'pt-BR'));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
