import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminSubscribersController, SubscriptionsService } from './subscriptions.js';

@Module({
  controllers: [AdminController, AdminSubscribersController],
  providers: [SubscriptionsService],
})
export class AdminModule {}
