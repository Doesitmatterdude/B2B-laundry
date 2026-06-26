import { Module } from '@nestjs/common';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';
import { PrismaService } from '../../config/prisma.service';

@Module({
  controllers: [InvestigationsController],
  providers: [InvestigationsService, PrismaService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}