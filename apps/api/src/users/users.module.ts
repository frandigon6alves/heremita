import { Module } from '@nestjs/common';
import { DiscoveryModule } from '../discovery/discovery.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
