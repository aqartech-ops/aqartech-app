import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from './auth-context.js';

type LogInput = {
  action: string;
  companyId?: string | null;
  entity?: string;
  entityId?: string;
  details?: unknown;
};

/** Writes the activity log (سجل النشاط). Never throws: logging must not break the action itself. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(actor: AuthContext | null, input: LogInput): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          actorType: !actor ? 'SYSTEM' : actor.kind === 'admin' ? 'PLATFORM_ADMIN' : 'USER',
          actorId: !actor ? null : actor.kind === 'admin' ? actor.adminId : actor.userId,
          companyId: input.companyId ?? (actor?.kind === 'user' ? actor.companyId : null),
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          details: input.details === undefined ? undefined : (JSON.parse(JSON.stringify(input.details)) as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write activity log for ${input.action}`, error as Error);
    }
  }
}
