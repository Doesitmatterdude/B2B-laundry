import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LotsModule } from './modules/lots/lots.module';
import { InvestigationsModule } from './modules/investigations/investigations.module';
import { BillingModule } from './modules/billing/billing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PortalModule } from './modules/portal/portal.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

// M0: Auth + global guards (JWT -> Rate limit -> Roles/permissions -> Tenant scope).
// M1: Clients + Categories.
// M2: Lots (pickup) + Route (field schedule).
// M3: Tagging + Wash pipeline + Packing (three-way reconciliation).
// M4: Return delivery + Investigations (missing-cloth case management).
// M5: Billing (invoices, GST, payments, ledger, credit notes).
// M6: Dashboard (live KPIs) + Analytics (comparisons, charts, heatmap, stats).
// M7: Client Portal (self-service) + Notifications (WhatsApp/SMS/Email/Push).
// M8: Audit logs + Rate limiting + Security headers + Hardening.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ClientsModule,
    CategoriesModule,
    LotsModule,
    InvestigationsModule,
    BillingModule,
    DashboardModule,
    AnalyticsModule,
    PortalModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
