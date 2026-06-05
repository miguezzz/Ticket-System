import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { HoldsModule } from './holds/holds.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [HoldsModule, EventsModule, ReservationsModule],
  controllers: [HealthController],
})
export class AppModule {}
