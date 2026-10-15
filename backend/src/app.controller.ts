import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './common/auth-context.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check — the app uses it to confirm the server is reachable. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
