import { Module } from '@nestjs/common';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [HoldsController],
  providers: [HoldsService, RedisService],
  exports: [HoldsService],
})
export class HoldsModule {}
