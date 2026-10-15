import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller.js';

@Module({
  controllers: [CompanyController],
})
export class CompanyModule {}
