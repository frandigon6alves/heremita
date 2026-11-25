import type { Locale } from '@heremita/shared';
import { haversineMeters } from '../providers/core/geo.js';
import { GAZETTEER } from '../providers/fake/gazetteer.js';
import { photonLang } from '../providers/photon/photon.mapper.js';
import {
  IdeaGeneratorError,
  type IdeaBatch,
  type IdeaFailureKind,
  type IdeaGenerator,
  type IdeaRequest,
} from './idea-generator.js';

const REASONS: Record<Locale, string> = {
  en: 'Sample suggestion from the offline gazetteer.',
  es: 'Sugerencia de ejemplo del nomenclátor sin conexión.',
  'pt-BR': 'Sugestão de exemplo do gazetteer offline.',
};

/** Words that make the fake return a made-up place, so grounding has something to drop. */
export const FAKE_INVENTED_PLACE = 'Museu Imaginário do Teste';

export interface FakeIdeaOptions {
  /** Every call fails with this kind. Test-only fault injection; never reachable from env or HTTP. */
  failWith?: IdeaFailureKind;
}

/**
 * Deterministic ideas without a network or a key (dev, tests, e2e): the
 * gazetteer's points of interest nearest the destination, not already in the
 * trip, nearest first, plus one invented place that grounding must drop.
 */
export class FakeIdeaGenerator implements IdeaGenerator {
  readonly id = 'fake';

  constructor(private readonly options: FakeIdeaOptions = {}) {}

  generate(request: IdeaRequest): Promise<IdeaBatch> {
    if (this.options.failWith) {
      return Promise.reject(new IdeaGeneratorError(this.options.failWith, 'Injected failure.'));
    }
    const lang = photonLang(request.locale);
    const taken = new Set(request.alreadyInTrip.map((name) => name.toLowerCase()));
    const nearest = GAZETTEER.filter((place) => place.kind === 'poi')
      .map((place) => ({
        place,
        distance: haversineMeters(request.destination.center, place.location),
      }))
      .filter(({ place }) => !taken.has(place.localized[lang].name.toLowerCase()))
      .sort((a, b) => a.distance - b.distance || (a.place.key < b.place.key ? -1 : 1))
      .slice(0, Math.max(0, request.count - 1))
      .map(({ place }) => ({
        name: place.localized[lang].name,
        category: place.category,
        reason: REASONS[request.locale],
      }));
    return Promise.resolve({
      ideas: [
        ...nearest,
        { name: FAKE_INVENTED_PLACE, category: 'culture', reason: REASONS[request.locale] },
      ],
      model: 'fake',
      usage: null,
    });
  }
}
