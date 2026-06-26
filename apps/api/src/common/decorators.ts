import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './guards/jwt-auth.guard';
import { ROLES_KEY, PERMS_KEY } from './guards/roles.guard';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const Permissions = (...perms: string[]) => SetMetadata(PERMS_KEY, perms);
