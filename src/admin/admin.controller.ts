import { Controller, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('cleanup')
  @Roles(Role.ADMIN)
  async cleanupDatabase() {
    return this.adminService.cleanupDatabase();
  }

  @Post('cleanup-redis')
  @Roles(Role.ADMIN)
  async cleanupRedis() {
    return this.adminService.cleanupRedis();
  }
}


