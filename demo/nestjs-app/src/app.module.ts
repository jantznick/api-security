import { Module } from '@nestjs/common';
import { ApiGlimpseModule } from '@apiglimpse/nestjs';
import { AppController } from './app.controller.js';
import { UsersController } from './users.controller.js';
import { OrdersController } from './orders.controller.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [
    ApiGlimpseModule.forRoot({
      agentUrl: process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
      apiKey: process.env.API_SENSOR_KEY || '',
      sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
      serviceName: process.env.API_SENSOR_SERVICE_NAME || 'demo-nestjs-app',
    }),
  ],
  controllers: [AppController, UsersController, AuthController, OrdersController],
})
export class AppModule {}
