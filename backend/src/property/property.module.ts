import { Module } from '@nestjs/common';
import { PropertyService } from './property.service.js';
import { PropertyController } from './property.controller.js';

@Module({
  controllers: [PropertyController],
  providers: [PropertyService],
})
export class PropertyModule {}
