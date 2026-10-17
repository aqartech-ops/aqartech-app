import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { MailService } from './mail.service.js';

@Global()
@Module({
  providers: [ActivityService, MailService],
  exports: [ActivityService, MailService],
})
export class CommonModule {}
