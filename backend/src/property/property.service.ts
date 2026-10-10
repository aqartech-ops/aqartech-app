import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PropertyService {
  constructor(private prisma: PrismaService) {}

  async create(createPropertyDto: any) {
    return this.prisma.property.create({
      data: createPropertyDto,
    });
  }

  async findAll() {
    // جلب العقارات مع الوحدات التابعة لها
    return this.prisma.property.findMany({
      include: {
        units: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.property.findUnique({
      where: { id },
      include: { units: true, partners: true },
    });
  }

  async update(id: string, updatePropertyDto: any) {
    return this.prisma.property.update({
      where: { id },
      data: updatePropertyDto,
    });
  }

  async remove(id: string) {
    return this.prisma.property.delete({
      where: { id },
    });
  }
}