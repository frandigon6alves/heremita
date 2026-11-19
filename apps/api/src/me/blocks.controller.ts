import { Controller } from '@nestjs/common';
import { endpoints, type EndpointInput, type Page, type UserCard } from '@heremita/shared';
import type { SessionUser } from '../core/http/api-request.js';
import { CurrentUser } from '../core/http/current-user.decorator.js';
import { Endpoint } from '../core/http/endpoint.decorator.js';
import { Input } from '../core/http/input.decorator.js';
import { BlocksService } from './blocks.service.js';

@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Endpoint(endpoints.listBlocks)
  listBlocks(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.listBlocks>,
  ): Promise<Page<UserCard>> {
    return this.blocks.list(user.id, input.query);
  }

  @Endpoint(endpoints.blockUser)
  blockUser(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.blockUser>,
  ): Promise<void> {
    return this.blocks.block(user.id, input.params.userId);
  }

  @Endpoint(endpoints.unblockUser)
  unblockUser(
    @CurrentUser() user: SessionUser,
    @Input() input: EndpointInput<typeof endpoints.unblockUser>,
  ): Promise<void> {
    return this.blocks.unblock(user.id, input.params.userId);
  }
}
