import { Controller, Header } from '@nestjs/common';
import { endpoints, type EndpointInput, type PlaceSuggestions } from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { SuggestionsService } from './suggestions.service.js';

/** Place suggestions with AI (E52). */
@Controller()
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Endpoint(endpoints.suggestPlaces)
  @Header('Cache-Control', 'no-store')
  suggestPlaces(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.suggestPlaces>,
  ): Promise<PlaceSuggestions> {
    return this.suggestions.suggest(user.id, input.params.tripId, input.body);
  }
}
