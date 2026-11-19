import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MeController, BlocksController],
  providers: [MeService, BlocksService],
})
export class MeModule {}
