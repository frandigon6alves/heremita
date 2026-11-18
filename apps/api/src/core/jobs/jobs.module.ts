import { Module } from '@nestjs/common';
import { PurgeJob } from './purge.job.js';

/** Background jobs that run inside the API process. */
@Module({
  providers: [PurgeJob],
  exports: [PurgeJob],
})
export class JobsModule {}
