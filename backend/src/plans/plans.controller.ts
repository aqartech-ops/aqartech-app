import { Controller, Get } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { Auth, Public, type UserAuth } from '../common/auth-context.js';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Active plans for the registration screen. */
  @Public()
  @Get()
  list() {
    return this.plans.listActive();
  }

  /** The caller company's usage vs. its plan limits. */
  @Get('usage')
  usage(@Auth() auth: UserAuth) {
    return this.plans.usage(auth.companyId);
  }
}
