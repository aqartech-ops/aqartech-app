import { Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async create(createCompanyDto: CreateCompanyDto) {
    // سيتم حفظ الشركة في قاعدة البيانات مباشرة
    return this.prisma.company.create({
      data: createCompanyDto as Parameters<typeof this.prisma.company.create>[0]['data'],
    });
  }

  async findAll() {
    // جلب كل الشركات من قاعدة البيانات
    return this.prisma.company.findMany();
  }

  async findOne(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
    });
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  async remove(id: string) {
    return this.prisma.company.delete({
      where: { id },
    });
  }
}