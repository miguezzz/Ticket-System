import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { reservationItems, seats, sectors, sessions } from '../db/schema';
import { RedisService } from './redis.service';

const HOLD_TTL_SECONDS = 60;

type Dict = Record<string, unknown>;

@Injectable()
export class HoldsService {
  constructor(private readonly redisService: RedisService) {}

  async createSelection(sessionId: string) {
    await this.findSession(sessionId);

    return {
      selectionId: randomUUID(),
      expiresInSeconds: HOLD_TTL_SECONDS,
    };
  }

  async toggleSeatHold(sessionId: string, seatId: string, input: unknown) {
    const selectionId = requiredUuid(asDict(input).selectionId, 'selectionId');
    await this.assertAssignedSeat(sessionId, seatId);
    await this.assertSeatNotPersistedAsUnavailable(seatId);

    const key = seatHoldKey(sessionId, seatId);
    const currentOwner = await this.redisService.client.get(key);

    if (currentOwner === selectionId) {
      await this.redisService.client.del(key);
      return { status: 'RELEASED', selected: false };
    }

    if (currentOwner) {
      throw new ConflictException('Assento indisponivel.');
    }

    const result = await this.redisService.client.set(
      key,
      selectionId,
      'EX',
      HOLD_TTL_SECONDS,
      'NX',
    );

    if (result !== 'OK') {
      throw new ConflictException('Assento indisponivel.');
    }

    return {
      status: 'SELECTED',
      selected: true,
      expiresInSeconds: HOLD_TTL_SECONDS,
    };
  }

  async releaseSeatHold(sessionId: string, seatId: string, input: unknown) {
    const selectionId = requiredUuid(asDict(input).selectionId, 'selectionId');
    await this.releaseSeatHoldIfOwned(sessionId, seatId, selectionId);
    return { status: 'RELEASED', selected: false };
  }

  async holdGeneralAdmission(sessionId: string, sectorId: string, input: unknown) {
    const body = asDict(input);
    const selectionId = requiredUuid(body.selectionId, 'selectionId');
    const quantity = requiredPositiveInt(body.quantity, 'quantity');
    const sector = await this.assertGeneralSector(sessionId, sectorId);
    const activeCount = await this.countPersistedActiveItemsBySector(sectorId);
    const otherHeldCount = await this.countGeneralRedisHolds(
      sessionId,
      sectorId,
      selectionId,
    );

    if ((sector.capacity ?? 0) - activeCount - otherHeldCount < quantity) {
      throw new ConflictException('Capacidade insuficiente no setor.');
    }

    await this.redisService.client.set(
      generalHoldKey(sessionId, sectorId, selectionId),
      String(quantity),
      'EX',
      HOLD_TTL_SECONDS,
    );

    return {
      status: 'SELECTED',
      selected: true,
      quantity,
      expiresInSeconds: HOLD_TTL_SECONDS,
    };
  }

  async getSeatHoldOwners(sessionId: string) {
    const entries = new Map<string, string>();
    for (const key of await this.scanKeys(`hold:seat:${sessionId}:*`)) {
      const owner = await this.redisService.client.get(key);
      if (!owner) continue;

      entries.set(key.split(':').at(-1) ?? '', owner);
    }

    return entries;
  }

  async getGeneralHoldCounts(sessionId: string, sectorId: string, selectionId?: string) {
    let selectedCount = 0;
    let otherCount = 0;

    for (const key of await this.scanKeys(`hold:general:${sessionId}:${sectorId}:*`)) {
      const quantity = Number(await this.redisService.client.get(key));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const owner = key.split(':').at(-1);
      if (selectionId && owner === selectionId) selectedCount += quantity;
      else otherCount += quantity;
    }

    return { selectedCount, otherCount };
  }

  async assertSeatHoldsOwned(sessionId: string, seatIds: string[], selectionId: string) {
    for (const seatId of seatIds) {
      const owner = await this.redisService.client.get(seatHoldKey(sessionId, seatId));
      if (owner !== selectionId) {
        throw new ConflictException('Selecao expirada ou assento indisponivel.');
      }
    }
  }

  async assertGeneralHoldsOwned(
    sessionId: string,
    requests: { sectorId: string; quantity: number }[],
    selectionId: string,
  ) {
    for (const request of requests) {
      const quantity = Number(
        await this.redisService.client.get(
          generalHoldKey(sessionId, request.sectorId, selectionId),
        ),
      );

      if (!Number.isFinite(quantity) || quantity < request.quantity) {
        throw new ConflictException('Selecao expirada ou quantidade indisponivel.');
      }
    }
  }

  async releaseSeatHolds(sessionId: string, seatIds: string[], selectionId: string) {
    await Promise.all(
      seatIds.map((seatId) => this.releaseSeatHoldIfOwned(sessionId, seatId, selectionId)),
    );
  }

  async releaseGeneralHolds(
    sessionId: string,
    requests: { sectorId: string }[],
    selectionId: string,
  ) {
    await Promise.all(
      requests.map((request) =>
        this.redisService.client.del(generalHoldKey(sessionId, request.sectorId, selectionId)),
      ),
    );
  }

  async flushAllForTests() {
    if (process.env.NODE_ENV !== 'test') return;
    await this.redisService.client.flushdb();
  }

  private async findSession(sessionId: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) throw new NotFoundException('Sessao nao encontrada.');
    return session;
  }

  private async assertAssignedSeat(sessionId: string, seatId: string) {
    const session = await this.findSession(sessionId);
    if (session.seatingMode !== 'ASSIGNED') {
      throw new BadRequestException('Hold por assento so vale para sessoes ASSIGNED.');
    }

    const [seat] = await db
      .select({ id: seats.id })
      .from(seats)
      .where(and(eq(seats.id, seatId), eq(seats.sessionId, sessionId)))
      .limit(1);

    if (!seat) throw new NotFoundException('Assento nao encontrado na sessao.');
  }

  private async assertGeneralSector(sessionId: string, sectorId: string) {
    const session = await this.findSession(sessionId);
    if (session.seatingMode !== 'GENERAL') {
      throw new BadRequestException('Hold por setor so vale para sessoes GENERAL.');
    }

    const [sector] = await db
      .select()
      .from(sectors)
      .where(and(eq(sectors.id, sectorId), eq(sectors.sessionId, sessionId)))
      .limit(1);

    if (!sector) throw new NotFoundException('Setor nao encontrado na sessao.');
    if (sector.capacity === null) {
      throw new BadRequestException('Setor GENERAL precisa ter capacity.');
    }

    return sector;
  }

  private async assertSeatNotPersistedAsUnavailable(seatId: string) {
    const active = await db
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(and(eq(reservationItems.seatId, seatId), ne(reservationItems.status, 'RELEASED')))
      .limit(1);

    if (active.length) {
      throw new ConflictException('Assento indisponivel.');
    }
  }

  private async countPersistedActiveItemsBySector(sectorId: string) {
    const active = await db
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(
        and(eq(reservationItems.sectorId, sectorId), ne(reservationItems.status, 'RELEASED')),
      );

    return active.length;
  }

  private async countGeneralRedisHolds(
    sessionId: string,
    sectorId: string,
    selectionId: string,
  ) {
    const counts = await this.getGeneralHoldCounts(sessionId, sectorId, selectionId);
    return counts.otherCount;
  }

  private async releaseSeatHoldIfOwned(sessionId: string, seatId: string, selectionId: string) {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    await this.redisService.client.eval(script, 1, seatHoldKey(sessionId, seatId), selectionId);
  }

  private async scanKeys(pattern: string) {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redisService.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
}

function seatHoldKey(sessionId: string, seatId: string) {
  return `hold:seat:${sessionId}:${seatId}`;
}

function generalHoldKey(sessionId: string, sectorId: string, selectionId: string) {
  return `hold:general:${sessionId}:${sectorId}:${selectionId}`;
}

function asDict(value: unknown, field = 'body'): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser um objeto.`);
  }
  return value as Dict;
}

function requiredUuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(`${field} deve ser um UUID valido.`);
  }
  return value;
}

function requiredPositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} deve ser inteiro positivo.`);
  }
  return value;
}
