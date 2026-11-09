import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

// Large money columns (e.g. property values in baisa) are BigInt in the database.
// They stay far below Number.MAX_SAFE_INTEGER (9 quadrillion baisa), so JSON sends them as numbers.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // documents and scans are sent as base64 JSON (up to 2 images of 10 MB)
  app.useBodyParser('json', { limit: '30mb' });

  // The app (phone, tablet, web) calls this API from other origins.
  // CORS_ORIGINS="http://localhost:8081,https://app.aqartech.om" — empty means allow all (development).
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true });

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so a phone on the same Wi-Fi can reach the server during development.
  await app.listen(port, '0.0.0.0');
  console.log(`AqarTech API running on http://localhost:${port}`);
}
await bootstrap();
