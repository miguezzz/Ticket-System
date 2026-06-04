import { Body, Controller, Param, Patch, Post, Put } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('admin')
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('events')
  createEvent(@Body() body: unknown) {
    return this.eventsService.createEvent(body);
  }

  @Patch('events/:eventId')
  updateEvent(@Param('eventId') eventId: string, @Body() body: unknown) {
    return this.eventsService.updateEvent(eventId, body);
  }

  @Post('events/:eventId/sessions')
  createSession(@Param('eventId') eventId: string, @Body() body: unknown) {
    return this.eventsService.createSession(eventId, body);
  }

  @Patch('sessions/:sessionId')
  updateSession(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.eventsService.updateSession(sessionId, body);
  }

  @Post('sessions/:sessionId/sectors')
  createSector(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.eventsService.createSector(sessionId, body);
  }

  @Patch('sectors/:sectorId')
  updateSector(@Param('sectorId') sectorId: string, @Body() body: unknown) {
    return this.eventsService.updateSector(sectorId, body);
  }

  @Put('sectors/:sectorId/prices')
  replaceSectorPrices(@Param('sectorId') sectorId: string, @Body() body: unknown) {
    return this.eventsService.replaceSectorPrices(sectorId, body);
  }

  @Post('sectors/:sectorId/seats/generate')
  generateSeats(@Param('sectorId') sectorId: string, @Body() body: unknown) {
    return this.eventsService.generateSeats(sectorId, body);
  }
}
