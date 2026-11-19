import { Controller } from '@nestjs/common';
import { endpoints, type EndpointInput, type Page, type ReportItem } from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { ModerationService } from './moderation.service.js';

/** Moderator-only (the session guard answers 403 `forbidden` to everyone else, V10). */
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Endpoint(endpoints.listReports)
  listReports(
    @Input() input: EndpointInput<typeof endpoints.listReports>,
  ): Promise<Page<ReportItem>> {
    return this.moderation.list(input.query);
  }

  @Endpoint(endpoints.decideReport)
  decideReport(
    @CurrentUser() moderator: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.decideReport>,
  ): Promise<ReportItem> {
    return this.moderation.decide(moderator.id, input.params.reportId, input.body.decision);
  }
}
