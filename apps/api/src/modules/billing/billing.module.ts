import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../config/prisma.service';

@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService, PaymentsService, PrismaService],
  exports: [InvoicesService, PaymentsService],
})
export class BillingModule {}