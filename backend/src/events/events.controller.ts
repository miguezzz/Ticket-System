import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('events')
  listEvents() {
    return this.eventsService.listEvents();
  }

  @Get('events/:eventId')
  getEvent(@Param('eventId') eventId: string) {
    return this.eventsService.getEvent(eventId);
  }

  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.eventsService.getSession(sessionId);
  }

  @Get('sessions/:sessionId/availability')
  getAvailability(
    @Param('sessionId') sessionId: string,
    @Query('selectionId') selectionId?: string,
  ) {
    return this.eventsService.getAvailability(sessionId, selectionId);
  }
}
