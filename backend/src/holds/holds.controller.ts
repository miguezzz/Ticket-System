import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { HoldsService } from './holds.service';

@Controller()
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post('sessions/:sessionId/selections')
  createSelection(@Param('sessionId') sessionId: string) {
    return this.holdsService.createSelection(sessionId);
  }

  @Post('sessions/:sessionId/seats/:seatId/hold')
  toggleSeatHold(
    @Param('sessionId') sessionId: string,
    @Param('seatId') seatId: string,
    @Body() body: unknown,
  ) {
    return this.holdsService.toggleSeatHold(sessionId, seatId, body);
  }

  @Delete('sessions/:sessionId/seats/:seatId/hold')
  releaseSeatHold(
    @Param('sessionId') sessionId: string,
    @Param('seatId') seatId: string,
    @Body() body: unknown,
  ) {
    return this.holdsService.releaseSeatHold(sessionId, seatId, body);
  }

  @Post('sessions/:sessionId/sectors/:sectorId/hold')
  holdGeneralAdmission(
    @Param('sessionId') sessionId: string,
    @Param('sectorId') sectorId: string,
    @Body() body: unknown,
  ) {
    return this.holdsService.holdGeneralAdmission(sessionId, sectorId, body);
  }
}
