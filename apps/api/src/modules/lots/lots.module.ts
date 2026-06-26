import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { RouteController } from './route.controller';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { PrismaService } from '../../config/prisma.service';

@Module({
  controllers: [LotsController, RouteController, WorkflowController, DeliveryController],
  providers: [LotsService, WorkflowService, DeliveryService, PrismaService],
  exports: [LotsService, WorkflowService, DeliveryService],
})
export class LotsModule {}