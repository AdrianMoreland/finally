import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { loadEnv } from './common/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Swagger UI needs inline scripts; everything else gets helmet's strict defaults.
  const strict = helmet();
  const relaxed = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/docs') ? relaxed(req, res, next) : strict(req, res, next),
  );

  app.enableCors({
    origin: [env.WEB_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    exposedHeaders: ['content-disposition'],
    maxAge: 600,
  });

  const config = new DocumentBuilder()
    .setTitle('Finally API')
    .setDescription('Personal finance API. Every request and response shape is a Zod schema in @finally/contracts.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)));

  await app.listen(env.PORT);
  app.get(Logger).log(`Finally API on :${env.PORT} (docs at /docs, bank=${env.BANK_PROVIDER}, market=${env.MARKET_DATA_PROVIDER})`);
}

void bootstrap();
