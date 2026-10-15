import { Body, Controller, ForbiddenException, Get, Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, type UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';

/** The caller's own company (الشركة / حساب المشترك). */
@Controller('company')
export class CompanyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  @Get('me')
  me(@Auth() auth: UserAuth) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { id: true, type: true, name: true, ownerName: true, email: true, phone: true, logo: true, locale: true },
    });
  }

  @Patch('me')
  async update(@Auth() auth: UserAuth, @Body() input: unknown) {
    if (!auth.isCompanyAdmin) throw new ForbiddenException('auth.noPermission');
    const src = v.body(input);
    const data = {
      name: src.name !== undefined ? v.requiredString(src, 'name', 160) : undefined,
      ownerName: v.optionalString(src, 'ownerName', 120),
      email: src.email !== undefined && src.email !== '' ? v.email(src) : undefined,
      phone: v.optionalString(src, 'phone', 30),
      locale: src.locale !== undefined ? v.oneOf(src, 'locale', ['en', 'ar'] as const) : undefined,
    };
    const company = await this.prisma.company.update({ where: { id: auth.companyId }, data });
    await this.activity.log(auth, { action: 'company.update', entity: 'Company', entityId: company.id, details: src });
    return company;
  }
}
