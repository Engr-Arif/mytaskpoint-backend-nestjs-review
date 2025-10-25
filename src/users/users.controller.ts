import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto, user);
  }

  @Get()
  async getAll(@CurrentUser() user: AuthUser) {
    return this.usersService.getAllUsers(user);
  }

  @Get('me')
  async getOwnProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getOwnProfile(user);
  }

  @Public()
  @Get('activeworkers')
  async getActiveWorkers(@CurrentUser() user: AuthUser) {
    return this.usersService.getActiveWorkers(user);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.getUserById(id, user);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto
  ) {
    return this.usersService.updateUser(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteUser(id, user);
  }
}
