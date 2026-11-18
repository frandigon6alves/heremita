import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, APP_NAME } from '@heremita/shared';
import { Logger as JsonLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EnvValidationError, parseEnv, type Env } from './config/env.js';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** In-flight requests get this long to finish once a shutdown signal arrives. */
const SHUTDOWN_DEADLINE_MS = 10_000;

/** Fails fast, with a readable message and no stack trace, when the environment is wrong. */
function loadEnvOrExit(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnvOrExit();

// Logs from boot onwards go through pino (JSON lines on stdout).
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
app.useLogger(app.get(JsonLogger));
configureApp(app);

// On a signal Nest stops accepting connections, waits for in-flight requests,
// runs the shutdown hooks (closing the database pool) and exits with code 0.
app.enableShutdownHooks([...SHUTDOWN_SIGNALS], { useProcessExit: true });
for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    setTimeout(() => {
      Logger.error(`Shutdown took longer than ${SHUTDOWN_DEADLINE_MS} ms; exiting`, 'Bootstrap');
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS).unref();
  });
}

await app.listen(env.PORT);
Logger.log(`${APP_NAME} API listening on http://localhost:${env.PORT}${API_PREFIX}`, 'Bootstrap');
