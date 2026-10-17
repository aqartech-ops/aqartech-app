import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { MailService } from '../common/mail.service.js';
import { hashPassword } from './auth.service.js';
import { TokenService } from './token.service.js';
import type { UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3; // per user per CODE_TTL_MINUTES

/**
 * Forgot / reset / change password (استعادة وتغيير كلمة المرور).
 * Reset uses a 6-digit code sent by email; only its hash is stored, it expires after 15 minutes
 * and allows 5 attempts. Any password change signs out all other sessions of that account.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger('Password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly tokens: TokenService,
  ) {}

  /** Always answers the same, whether the email exists or not (no account discovery). */
  async forgot(input: unknown) {
    const src = v.body(input);
    const email = v.email(src);
    const lang = src.locale === 'ar' ? 'ar' : 'en';

    const user = await this.prisma.user.findUnique({ where: { email }, include: { company: true } });
    if (!user || !user.isActive || user.deletedAt || user.company.deletedAt) return { ok: true };

    const since = new Date(Date.now() - CODE_TTL_MINUTES * 60_000);
    const recent = await this.prisma.passwordResetCode.count({ where: { userId: user.id, createdAt: { gte: since } } });
    if (recent >= MAX_CODES_PER_WINDOW) return { ok: true };

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    const text =
      lang === 'ar'
        ? `مرحباً ${user.name}،\n\nرمز استعادة كلمة المرور في AqarTech هو: ${code}\n\nالرمز صالح لمدة ${CODE_TTL_MINUTES} دقيقة. إن لم تطلب ذلك فتجاهل هذه الرسالة.`
        : `Hello ${user.name},\n\nYour AqarTech password reset code is: ${code}\n\nIt is valid for ${CODE_TTL_MINUTES} minutes. If you did not ask for this, ignore this email.`;
    try {
      await this.mail.send({
        to: user.email,
        subject: lang === 'ar' ? 'رمز استعادة كلمة المرور — AqarTech' : 'Your AqarTech password reset code',
        text,
      });
    } catch (error) {
      this.logger.error(`Could not send reset code to ${user.email}`, error as Error);
    }
    await this.activity.log(null, { action: 'auth.forgotPassword', companyId: user.companyId, entity: 'User', entityId: user.id });
    return { ok: true };
  }

  async reset(input: unknown) {
    const src = v.body(input);
    const email = v.email(src);
    const code = typeof src.code === 'string' ? src.code.replace(/\s/g, '') : '';
    const password = v.password(src);
    if (!/^\d{6}$/.test(code)) throw new BadRequestException({ message: 'reset.invalidCode', field: 'code' });

    const user = await this.prisma.user.findUnique({ where: { email } });
    const record = user
      ? await this.prisma.passwordResetCode.findFirst({
          where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (!user || !record || record.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException({ message: 'reset.invalidCode', field: 'code' });
    }

    const ok = await bcrypt.compare(code, record.codeHash);
    if (!ok) {
      await this.prisma.passwordResetCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException({ message: 'reset.invalidCode', field: 'code' });
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: now } }),
      this.prisma.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    ]);
    await this.activity.log(null, { action: 'auth.resetPassword', companyId: user.companyId, entity: 'User', entityId: user.id });
    return { ok: true };
  }

  /** Signed-in user changes their own password (needs the current one). */
  async change(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const current = typeof src.currentPassword === 'string' ? src.currentPassword : '';
    const password = v.password(src);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      // 400, not 401: a wrong current password must not sign the user out
      throw new BadRequestException({ message: 'auth.wrongCurrentPassword', field: 'currentPassword' });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
    });
    await this.activity.log(auth, { action: 'auth.changePassword', entity: 'User', entityId: user.id });
    // Other devices are signed out; this device continues with a fresh session.
    return { ok: true, token: this.tokens.sign({ sub: user.id, kind: 'user' }) };
  }
}
