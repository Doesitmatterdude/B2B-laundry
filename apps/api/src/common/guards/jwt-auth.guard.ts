import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

// Marks a route as public (skips auth): @Public()
export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload = await this.jwt.verifyAsync(auth.slice(7), {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      req.user = payload; // { sub, tenant_id, role, perms, client_id, ... }
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
