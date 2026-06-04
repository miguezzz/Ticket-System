import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [EventsModule, ReservationsModule],
  controllers: [HealthController],
})
export class AppModule {}
