import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import { PlacesModule } from '../places/places.module.js';
import { createClaudeIdeaGenerator } from './claude-idea-generator.js';
import { DailyBudget } from './daily-budget.js';
import { FakeIdeaGenerator } from './fake-idea-generator.js';
import { IDEA_GENERATOR, type IdeaGenerator } from './idea-generator.js';
import { SuggestionsController } from './suggestions.controller.js';
import { SuggestionsService } from './suggestions.service.js';

export function selectIdeaGenerator(env: Env): IdeaGenerator | null {
  switch (env.AI_PROVIDER) {
    case 'claude':
      // parseEnv requires the key whenever AI_PROVIDER=claude.
      return createClaudeIdeaGenerator(env.ANTHROPIC_API_KEY ?? '', env.AI_MODEL);
    case 'fake':
      return new FakeIdeaGenerator();
    case 'off':
      return null;
  }
}

@Module({
  imports: [PlacesModule],
  controllers: [SuggestionsController],
  providers: [
    SuggestionsService,
    { provide: IDEA_GENERATOR, inject: [ENV], useFactory: selectIdeaGenerator },
    {
      provide: DailyBudget,
      inject: [ENV, CLOCK],
      useFactory: (env: Env, clock: Clock) => new DailyBudget(env.AI_DAILY_LIMIT, clock),
    },
  ],
})
export class SuggestionsModule {}
