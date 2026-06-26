import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

// M7: Support tickets — clients raise and track tickets; admin responds.
// SRS 11.9, 13.10.

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string, clientId?: string) {
    const where: any = { tenantId };
    if (clientId) where.clientId = clientId;
    return this.prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true, code: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async create(tenantId: string, clientId: string, userId: string, dto: { subject: string; body: string; priority?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          tenantId, clientId,
          subject: dto.subject,
          priority: dto.priority ?? 'normal',
          createdBy: userId,
        },
      });
      await tx.ticketMessage.create({
        data: {
          tenantId, ticketId: ticket.id,
          authorUserId: userId,
          body: dto.body,
        },
      });
      return tx.supportTicket.findUnique({
        where: { id: ticket.id },
        include: { messages: true },
      });
    });
  }

  async reply(tenantId: string, ticketId: string, userId: string, body: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const msg = await this.prisma.ticketMessage.create({
      data: { tenantId, ticketId, authorUserId: userId, body },
    });

    // If client replies, set status to pending (waiting for admin)
    // If admin replies, set status to open (waiting for client)
    return msg;
  }

  async updateStatus(tenantId: string, ticketId: string, status: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status, resolvedAt: ['resolved', 'closed'].includes(status) ? new Date() : null },
    });
  }
}