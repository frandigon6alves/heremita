import { Controller, Res } from '@nestjs/common';
import { API_PREFIX, endpoints, type CreatedId, type EndpointInput } from '@heremita/shared';
import type { Response } from 'express';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { ReportsService } from './reports.service.js';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** E49. `Location` names the moderation resource: there is no public report GET (CD7). */
  @Endpoint(endpoints.createReport)
  async createReport(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.createReport>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreatedId> {
    const created = await this.reports.create(user.id, input.body);
    response.location(`${API_PREFIX}/moderation/reports/${created.id}`);
    return created;
  }
}
