import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser, type RequestUser } from './auth.decorators';
import { AuthService } from './auth.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Controller('admin/users')
export class AdminController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.auth.listUsers(actor.role);
  }

  @Patch(':userId')
  updateRole(
    @CurrentUser() actor: RequestUser,
    @Param('userId') userId: string,
    @Body() input: UpdateUserRoleDto,
  ) {
    return this.auth.updateUserRole(actor.role, userId, input.role);
  }
}
