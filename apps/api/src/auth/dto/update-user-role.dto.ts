import { IsIn } from 'class-validator';
import type { UserRole } from '@paralleax/shared';

export class UpdateUserRoleDto {
  @IsIn(['user', 'admin'])
  role!: UserRole;
}
