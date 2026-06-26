import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // M0: password login. M1+: OTP login, refresh rotation w/ reuse detection,
  // lockout/CAPTCHA, optional TOTP 2FA (see SRS 7.1 / FR-001..008).
  async login(identifier: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        status: 'active',
        deletedAt: null,
      },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const role = user.userRoles[0]?.role;
    const perms = role?.rolePermissions.map((rp) => rp.permission.code) ?? [];

    const claims = {
      sub: user.id,
      tenant_id: user.tenantId,
      role: role?.code ?? (user.isSuperAdmin ? 'SUPER_ADMIN' : 'CLIENT'),
      perms,
      client_id: user.clientId ?? null,
    };

    const access_token = await this.jwt.signAsync(claims);
    // TODO(M1): issue rotating refresh token persisted hashed in refresh_tokens.
    return { access_token, user: { id: user.id, role: claims.role, tenant_id: user.tenantId } };
  }

  static hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
