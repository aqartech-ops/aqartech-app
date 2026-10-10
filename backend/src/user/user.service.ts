import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

async create(createUserDto: CreateUserDto) {
    try {
      // 1. جلب أول شركة مسجلة تلقائياً لتفادي خطأ الـ CompanyId الإلزامي
      let company = await this.prisma.company.findFirst();
      if (!company) {
        // إذا لم تكن هناك أي شركة، نقوم بإنشاء شركة افتراضية تلقائياً
        company = await this.prisma.company.create({
          data: { name: 'الشركة الافتراضية' },
        });
      }

      // 2. جلب أول صلاحية (Role) مسجلة لتفادي خطأ الـ RoleId الإلزامي
      let role = await this.prisma.role.findFirst();
      if (!role) {
        // إذا لم تكن هناك صلاحية، نقوم بإنشاء صلاحية افتراضية
        role = await this.prisma.role.create({
          data: { name: 'Admin' },
        });
      }

      // 3. إنشاء المستخدم مع ربطه بالشركة والصلاحية الحقيقية التي تم جلبها
      return await this.prisma.user.create({
        data: {
          name: createUserDto.name,
          email: createUserDto.email || `${Date.now()}@aqartech.com`,
          password: createUserDto.password || 'DefaultPassword123',
          phone: createUserDto.phone || null,
          companyId: company.id, // ربطه بمعرف شركة حقيقي وموجود
          roleId: role.id,       // ربطه بمعرف صلاحية حقيقي وموجود
        },
      });
    } catch (error) {
      console.error('CRITICAL PRISMA ERROR:', error);
      throw error;
    }
  }

  async findAll() {
    return await this.prisma.user.findMany();
  }

  async findOne(id: string) {
    return await this.prisma.user.findUnique({
      where: { id },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    return await this.prisma.user.update({
      where: { id },
      data: updateUserDto as any,
    });
  }

  async remove(id: string) {
    return await this.prisma.user.delete({
      where: { id },
    });
  }
}