import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

// M8: Rate limiting via in-memory token bucket (per IP + per tenant).
// In production, replace with Redis-backed limiter (BullMQ or ioredis).
// SRS 19.1, NFR, FR-122. Stricter limits on auth/OTP endpoints.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000; // 1 minute
  private readonly defaultLimit = 100; // 100 req/min
  private readonly authLimit = 10; // 10 auth attempts/min
  private readonly otpLimit = 3; // 3 OTP requests/min

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const tenantId = req.user?.tenant_id ?? 'anonymous';
    const path = req.path || req.url || '';

    // Determine limit based on endpoint
    let limit = this.defaultLimit;
    if (path.includes('/auth/login') || path.includes('/auth/password')) {
      limit = this.authLimit;
    } else if (path.includes('/auth/otp')) {
      limit = this.otpLimit;
    }

    const key = `${tenantId}:${ip}:${path.includes('/auth/') ? 'auth' : 'api'}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * limit);
    if (refill > 0) {
      bucket.tokens = Math.min(limit, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.tokens--;
    return true;
  }
}