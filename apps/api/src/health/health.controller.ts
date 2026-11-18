import { Controller, Logger } from '@nestjs/common';
import { endpoints, type LivenessResponse, type ReadinessResponse } from '@heremita/shared';
import { ApiProblem } from '../core/http/api-problem.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** E1 liveness: checks nothing external, so a database outage never gets the API restarted. */
  @Endpoint(endpoints.getLiveness)
  liveness(): LivenessResponse {
    return { status: 'ok' };
  }

  /** E2 readiness: the database pool can run a query. */
  @Endpoint(endpoints.getReadiness)
  async readiness(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(
        `Readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ApiProblem('database_unavailable', 'The database is not reachable.');
    }

    return { status: 'ok', db: 'up' };
  }
}
