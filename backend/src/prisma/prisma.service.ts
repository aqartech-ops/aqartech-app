import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // تُنفذ هذه الدالة تلقائياً عند تشغيل السيرفر لفتح الاتصال بقاعدة البيانات
  async onModuleInit() {
    await this.$connect();
  }

  // تُنفذ عند إيقاف السيرفر لغلق الاتصال بشكل آمن
  async onModuleDestroy() {
    await this.$disconnect();
  }
}