import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../config/prisma.service';

// M8: Audit interceptor — automatically logs mutations (POST/PATCH/DELETE)
// to the audit_logs table with before/after context.
// SRS 19.2, FR-120. Applied globally via APP_INTERCEPTOR.

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = ctx.switchToHttp().getRequest();
    const method = req.method;

    // Only audit mutations
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Skip auth endpoints (login, etc.)
    if (req.path?.includes('/auth/')) {
      return next.handle();
    }

    const tenantId = req.tenantId ?? req.user?.tenant_id;
    const actorUserId = req.user?.sub;
    const action = this.deriveAction(method, req.path);
    const entityType = this.deriveEntityType(req.path);

    return next.handle().pipe(
      tap({
        next: (result) => {
          // Write audit log asynchronously (fire-and-forget)
          if (tenantId && entityType) {
            this.prisma.auditLog
              .create({
                data: {
                  tenantId,
                  actorUserId,
                  action,
                  entityType,
                  entityId: result?.id ?? result?.data?.id ?? null,
                  after: result ? this.sanitize(result) : null,
                  ip: req.ip,
                  userAgent: req.headers['user-agent']?.slice(0, 200),
                },
              })
              .catch(() => {
                // Silent fail — audit logging must not break the request
              });
          }
        },
      }),
    );
  }

  private deriveAction(method: string, path: string): string {
    if (method === 'POST') {
      if (path.includes('/deactivate')) return 'deactivate';
      if (path.includes('/activate')) return 'activate';
      if (path.includes('/issue')) return 'issue';
      if (path.includes('/void')) return 'void';
      if (path.includes('/resolve')) return 'resolve';
      if (path.includes('/deliver')) return 'deliver';
      if (path.includes('/tagging')) return 'tag';
      if (path.includes('/packing')) return 'pack';
      if (path.includes('/status')) return 'status_change';
      return 'create';
    }
    if (method === 'PATCH' || method === 'PUT') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
  }

  private deriveEntityType(path: string): string | null {
    if (path.includes('/clients')) return 'client';
    if (path.includes('/categories')) return 'category';
    if (path.includes('/lots')) return 'lot';
    if (path.includes('/investigations')) return 'investigation';
    if (path.includes('/invoices')) return 'invoice';
    if (path.includes('/payments')) return 'payment';
    if (path.includes('/tickets')) return 'ticket';
    if (path.includes('/users')) return 'user';
    return null;
  }

  private sanitize(data: any): any {
    try {
      const str = JSON.stringify(data);
      // Truncate large payloads (audit logs should be compact)
      if (str.length > 10000) return { _truncated: true, _size: str.length };
      return JSON.parse(str);
    } catch {
      return { _error: 'serialization_failed' };
    }
  }
}