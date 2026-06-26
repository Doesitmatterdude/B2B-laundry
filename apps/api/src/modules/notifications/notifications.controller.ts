import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Roles, Permissions } from '../../common/decorators';

// SRS 13.10 — Notifications
// GET    /notifications           — inbox (filtered by user/client)
// PATCH  /notifications/:id/read  — mark read
// GET    /notification-preferences — get my prefs
// PUT    /notification-preferences — set pref (channel + event + enabled)
// GET    /notification-templates  — admin: list templates
// POST   /notification-templates  — admin: upsert template

@Controller()
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get('notifications')
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.list(req.tenantId, req.user.sub, req.clientId, q.page ? +q.page : 1, q.limit ? +q.limit : 20);
  }

  @Patch('notifications/:id/read')
  @Roles('ADMIN', 'DELIVERY', 'TAGGER', 'PACKER', 'CLIENT')
  markRead(@Param('id') id: string) {
    return this.svc.markRead(id);
  }

  @Get('notification-preferences')
  @Roles('ADMIN', 'CLIENT')
  getPrefs(@Req() req: any) {
    return this.svc.getPreferences(req.tenantId, req.user.sub, req.clientId);
  }

  @Post('notification-preferences')
  @Roles('ADMIN', 'CLIENT')
  setPref(@Req() req: any, @Body() body: { channel: string; event: string; enabled: boolean }) {
    return this.svc.setPreference(req.tenantId, body.channel, body.event, body.enabled, req.user.sub, req.clientId);
  }

  @Get('notification-templates')
  @Roles('ADMIN')
  @Permissions('notification:configure')
  listTemplates(@Req() req: any) {
    return this.svc.listTemplates(req.tenantId);
  }

  @Post('notification-templates')
  @Roles('ADMIN')
  @Permissions('notification:configure')
  upsertTemplate(@Req() req: any, @Body() body: { code: string; channel: string; body: string; subject?: string }) {
    return this.svc.upsertTemplate(req.tenantId, body.code, body.channel, body.body, body.subject);
  }
}