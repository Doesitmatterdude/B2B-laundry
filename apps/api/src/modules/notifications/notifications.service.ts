import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M7: Multi-channel notifications — WhatsApp, SMS, Email, Push.
// Template-driven, queued, preference-aware, event-triggered.
// SRS 17, 13.10, FR-110..114.

// Event catalog (SRS 17.2)
const EVENT_CHANNELS: Record<string, string[]> = {
  pickup_reminder: ['whatsapp', 'sms', 'push'],
  pickup_confirmed: ['whatsapp', 'email'],
  delivery_reminder: ['whatsapp', 'push'],
  delivery_completed: ['whatsapp', 'email'],
  invoice_issued: ['email', 'whatsapp'],
  invoice_reminder: ['whatsapp', 'sms', 'email'],
  missing_alert: ['whatsapp', 'push', 'email'],
  damage_alert: ['whatsapp', 'push'],
  sla_breach: ['push'],
  investigation_update: ['whatsapp', 'email'],
  ticket_reply: ['email', 'push'],
  announcement: ['whatsapp', 'email'],
};

@Injectable()
export class NotificationsService {
  private logger = new Logger('Notifications');

  constructor(private prisma: PrismaService) {}

  // ============ QUEUE NOTIFICATION ============
  // Called by domain events (lot created, invoice issued, etc.)
  async queue(tenantId: string, event: string, recipients: {
    userId?: string; clientId?: string; phone?: string; email?: string;
  }, payload: Record<string, any>) {
    const channels = EVENT_CHANNELS[event] ?? ['push'];

    // Check preferences (opt-out per event/channel)
    const prefs = await this.getActivePrefs(tenantId, recipients.userId, recipients.clientId);
    const activeChannels = channels.filter((ch) => {
      const pref = prefs.find((p) => p.channel === ch && p.event === event);
      return pref ? pref.enabled : true; // default: enabled
    });

    const queued: any[] = [];
    for (const channel of activeChannels) {
      // Get template
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { tenantId, code: event, channel },
      });
      if (!template) continue;

      // Render template body with payload variables
      const body = this.renderTemplate(template.body, payload);
      const subject = template.subject ? this.renderTemplate(template.subject, payload) : undefined;

      const notification = await this.prisma.notification.create({
        data: {
          tenantId,
          userId: recipients.userId ?? null,
          clientId: recipients.clientId ?? null,
          channel,
          templateCode: event,
          payload,
          status: 'queued',
        },
      });
      queued.push(notification);
    }

    // Process immediately (in production, this would be a BullMQ job)
    for (const n of queued) {
      this.send(n.id).catch((err) => this.logger.error(`Send failed for ${n.id}: ${err}`));
    }

    return { queued: queued.length, channels: activeChannels };
  }

  // ============ SEND (adapter dispatch) ============
  async send(notificationId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n) return;

    try {
      switch (n.channel) {
        case 'whatsapp':
          await this.sendWhatsApp(n);
          break;
        case 'sms':
          await this.sendSMS(n);
          break;
        case 'email':
          await this.sendEmail(n);
          break;
        case 'push':
          await this.sendPush(n);
          break;
      }
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'failed', error: String(err).slice(0, 500) },
      });
      this.logger.error(`Notification ${notificationId} failed: ${err}`);
    }
  }

  // ============ LIST (inbox) ============
  async list(tenantId: string, userId?: string, clientId?: string, page = 1, limit = 20) {
    const where: any = { tenantId };
    if (userId) where.userId = userId;
    if (clientId) where.clientId = clientId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data: items, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  // ============ MARK READ ============
  async markRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'read', readAt: new Date() },
    });
  }

  // ============ PREFERENCES ============
  async getPreferences(tenantId: string, userId?: string, clientId?: string) {
    return this.prisma.notificationPreference.findMany({
      where: { tenantId, userId, clientId },
    });
  }

  async setPreference(tenantId: string, channel: string, event: string, enabled: boolean, userId?: string, clientId?: string) {
    return this.prisma.notificationPreference.upsert({
      where: { id: 'placeholder' }, // Prisma doesn't have composite unique on these fields; use findFirst + create/update
      update: {},
      create: { tenantId, userId, clientId, channel, event, enabled },
    }).catch(async () => {
      // Fallback: find existing or create
      const existing = await this.prisma.notificationPreference.findFirst({
        where: { tenantId, userId, clientId, channel, event },
      });
      if (existing) {
        return this.prisma.notificationPreference.update({ where: { id: existing.id }, data: { enabled } });
      }
      return this.prisma.notificationPreference.create({
        data: { tenantId, userId, clientId, channel, event, enabled },
      });
    });
  }

  // ============ TEMPLATES (admin) ============
  async listTemplates(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({ where: { tenantId } });
  }

  async upsertTemplate(tenantId: string, code: string, channel: string, body: string, subject?: string) {
    const existing = await this.prisma.notificationTemplate.findFirst({
      where: { tenantId, code, channel },
    });
    if (existing) {
      return this.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: { body, subject },
      });
    }
    return this.prisma.notificationTemplate.create({
      data: { tenantId, code, channel, body, subject },
    });
  }

  // ============ ADAPTERS (stubs — wire to real providers at M8) ============
  private async sendWhatsApp(n: any) {
    // TODO(M8): WhatsApp Cloud API or Gupshup integration
    // POST to https://graph.facebook.com/v18.0/{phone_id}/messages
    this.logger.log(`[WhatsApp] Sending notification ${n.id} (event: ${n.templateCode})`);
  }

  private async sendSMS(n: any) {
    // TODO(M8): MSG91 / Twilio integration
    this.logger.log(`[SMS] Sending notification ${n.id} (event: ${n.templateCode})`);
  }

  private async sendEmail(n: any) {
    // TODO(M8): SES / SendGrid integration
    this.logger.log(`[Email] Sending notification ${n.id} (event: ${n.templateCode})`);
  }

  private async sendPush(n: any) {
    // TODO(M8): Web Push (VAPID) / FCM integration
    this.logger.log(`[Push] Sending notification ${n.id} (event: ${n.templateCode})`);
  }

  // ============ HELPERS ============
  private renderTemplate(template: string, payload: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(payload[key] ?? `{{${key}}}`));
  }

  private async getActivePrefs(tenantId: string, userId?: string, clientId?: string) {
    return this.prisma.notificationPreference.findMany({
      where: { tenantId, userId, clientId },
    });
  }
}