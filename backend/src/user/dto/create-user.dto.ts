export class CreateUserDto {
  name: string;
  email: string;
  phone?: string;
  companyId?: string;
  password?: string;
  roleId?: string;
}