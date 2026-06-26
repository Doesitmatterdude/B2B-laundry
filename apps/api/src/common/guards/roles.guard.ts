import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Usage: @Roles('ADMIN') or @Permissions('lot:tag') on controllers/handlers.
export const ROLES_KEY = 'roles';
export const PERMS_KEY = 'perms';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requiredRoles && !requiredPerms) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user; // populated by JwtAuthGuard
    if (!user) throw new ForbiddenException('No authenticated user');

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} not permitted`);
    }
    if (requiredPerms && !requiredPerms.every((p) => (user.perms ?? []).includes(p))) {
      throw new ForbiddenException('Missing required permission');
    }
    return true;
  }
}
