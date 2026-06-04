import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';

@Module({
  imports: [EventsModule],
  controllers: [HealthController],
})
export class AppModule {}
