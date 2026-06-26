import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaService } from '../../config/prisma.service';

@Module({
  controllers: [PortalController, SupportController],
  providers: [PortalService, SupportService, PrismaService],
  exports: [PortalService, SupportService],
})
export class PortalModule {}