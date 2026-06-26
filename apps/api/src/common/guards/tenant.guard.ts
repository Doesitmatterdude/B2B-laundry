import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// Defense-in-depth: derive tenant context ONLY from the verified JWT claim,
// never from request body/query. The data-access layer must inject
// `where: { tenantId: req.tenantId }` on every tenant-owned query, and
// Postgres RLS policies enforce isolation at the DB level as a backstop.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.tenant_id) {
      req.tenantId = req.user.tenant_id;
      // For CLIENT users, also force ownership scope downstream.
      if (req.user.client_id) req.clientId = req.user.client_id;
    }
    return true;
  }
}
