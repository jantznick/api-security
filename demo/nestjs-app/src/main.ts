import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT || 4002);
  await app.listen(port, '0.0.0.0');
  console.log(`Demo NestJS app on :${port}`);
  console.log(
    `Sensor → ${process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080'}`,
  );
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
