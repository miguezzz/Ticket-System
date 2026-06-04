import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

@Controller()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('sessions/:sessionId/reservations')
  createReservation(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.reservationsService.createReservation(sessionId, body);
  }

  @Get('reservations/:reservationId')
  getReservation(@Param('reservationId') reservationId: string) {
    return this.reservationsService.getReservation(reservationId);
  }

  @Post('reservations/:reservationId/cancel')
  cancelReservation(@Param('reservationId') reservationId: string, @Body() body: unknown) {
    return this.reservationsService.cancelReservation(reservationId, body);
  }

  @Post('admin/reservations/expire-due')
  expireDueReservations() {
    return this.reservationsService.expireDueReservations();
  }
}
