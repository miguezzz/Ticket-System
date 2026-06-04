import { Module } from '@nestjs/common';
import { AdminEventsController } from './admin-events.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, AdminEventsController],
  providers: [EventsService],
})
export class EventsModule {}
