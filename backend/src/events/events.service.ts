import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  events,
  reservationItems,
  seats,
  sectorPrices,
  sectors,
  sessions,
} from '../db/schema';

type SeatingMode = 'ASSIGNED' | 'GENERAL';
type SeatClass = 'STANDARD' | 'PREMIUM';
type FareType = 'FULL' | 'HALF';

type Dict = Record<string, unknown>;

@Injectable()
export class EventsService {
  async listEvents() {
    return db.select().from(events).orderBy(asc(events.createdAt));
  }

  async getEvent(eventId: string) {
    const event = await this.findEvent(eventId);
    const eventSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.eventId, eventId))
      .orderBy(asc(sessions.startsAt));

    return {
      ...event,
      sessions: eventSessions,
    };
  }

  async getSession(sessionId: string) {
    const session = await this.findSession(sessionId);
    const sectorList = await this.getSectorsWithPrices(sessionId);

    return {
      ...session,
      sectors: sectorList,
    };
  }

  async getAvailability(sessionId: string) {
    const session = await this.findSession(sessionId);
    const sectorList = await this.getSectorsWithPrices(sessionId);

    if (session.seatingMode === 'ASSIGNED') {
      return this.getAssignedAvailability(session, sectorList);
    }

    return this.getGeneralAvailability(session, sectorList);
  }

  async createEvent(input: unknown) {
    const body = asDict(input);
    const title = requiredString(body.title, 'title');
    const description = optionalString(body.description, 'description');

    const [event] = await db
      .insert(events)
      .values({ title, description })
      .returning();

    return event;
  }

  async updateEvent(eventId: string, input: unknown) {
    await this.findEvent(eventId);

    const body = asDict(input);
    const patch: Partial<typeof events.$inferInsert> = {};

    if ('title' in body) patch.title = requiredString(body.title, 'title');
    if ('description' in body) {
      patch.description = optionalString(body.description, 'description');
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    const [event] = await db
      .update(events)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(events.id, eventId))
      .returning();

    return event;
  }

  async createSession(eventId: string, input: unknown) {
    await this.findEvent(eventId);

    const body = asDict(input);
    const startsAt = requiredDate(body.startsAt, 'startsAt');
    const seatingMode = requiredEnum<SeatingMode>(
      body.seatingMode,
      ['ASSIGNED', 'GENERAL'],
      'seatingMode',
    );
    const maxTicketsPerUser = requiredPositiveInt(
      body.maxTicketsPerUser,
      'maxTicketsPerUser',
    );

    const [session] = await db
      .insert(sessions)
      .values({
        eventId,
        startsAt,
        room: optionalString(body.room, 'room'),
        seatingMode,
        maxTicketsPerUser,
      })
      .returning();

    return session;
  }

  async updateSession(sessionId: string, input: unknown) {
    await this.findSession(sessionId);
    await this.assertSessionHasNoOccupation(sessionId);

    const body = asDict(input);
    const patch: Partial<typeof sessions.$inferInsert> = {};

    if ('startsAt' in body) patch.startsAt = requiredDate(body.startsAt, 'startsAt');
    if ('room' in body) patch.room = optionalString(body.room, 'room');
    if ('seatingMode' in body) {
      patch.seatingMode = requiredEnum<SeatingMode>(
        body.seatingMode,
        ['ASSIGNED', 'GENERAL'],
        'seatingMode',
      );
    }
    if ('maxTicketsPerUser' in body) {
      patch.maxTicketsPerUser = requiredPositiveInt(
        body.maxTicketsPerUser,
        'maxTicketsPerUser',
      );
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    const [session] = await db
      .update(sessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning();

    return session;
  }

  async createSector(sessionId: string, input: unknown) {
    const session = await this.findSession(sessionId);
    const body = asDict(input);
    const name = requiredString(body.name, 'name');
    const seatClass = requiredEnum<SeatClass>(
      body.seatClass,
      ['STANDARD', 'PREMIUM'],
      'seatClass',
    );
    const capacity =
      'capacity' in body ? requiredPositiveInt(body.capacity, 'capacity') : null;

    if (session.seatingMode === 'GENERAL' && capacity === null) {
      throw new BadRequestException('capacity e obrigatorio para sessoes GENERAL.');
    }

    const [sector] = await db
      .insert(sectors)
      .values({
        sessionId,
        name,
        seatClass,
        capacity,
      })
      .returning();

    return sector;
  }

  async updateSector(sectorId: string, input: unknown) {
    await this.findSector(sectorId);
    await this.assertSectorHasNoOccupation(sectorId);

    const body = asDict(input);
    const patch: Partial<typeof sectors.$inferInsert> = {};

    if ('name' in body) patch.name = requiredString(body.name, 'name');
    if ('seatClass' in body) {
      patch.seatClass = requiredEnum<SeatClass>(
        body.seatClass,
        ['STANDARD', 'PREMIUM'],
        'seatClass',
      );
    }
    if ('capacity' in body) {
      patch.capacity =
        body.capacity === null ? null : requiredPositiveInt(body.capacity, 'capacity');
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    const [sector] = await db
      .update(sectors)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sectors.id, sectorId))
      .returning();

    return sector;
  }

  async replaceSectorPrices(sectorId: string, input: unknown) {
    await this.findSector(sectorId);
    await this.assertSectorHasNoOccupation(sectorId);

    const body = asDict(input);
    const prices = requiredArray(body.prices, 'prices').map((raw, index) => {
      const price = asDict(raw, `prices[${index}]`);
      return {
        sectorId,
        fareType: requiredEnum<FareType>(
          price.fareType,
          ['FULL', 'HALF'],
          `prices[${index}].fareType`,
        ),
        priceCents: requiredPositiveInt(
          price.priceCents,
          `prices[${index}].priceCents`,
        ),
        currency: optionalString(price.currency, `prices[${index}].currency`) ?? 'BRL',
      };
    });

    if (!prices.length) {
      throw new BadRequestException('Informe ao menos um preco.');
    }

    if (new Set(prices.map((price) => price.fareType)).size !== prices.length) {
      throw new BadRequestException('Nao repita fareType no mesmo setor.');
    }

    return db.transaction(async (tx) => {
      await tx.delete(sectorPrices).where(eq(sectorPrices.sectorId, sectorId));
      return tx.insert(sectorPrices).values(prices).returning();
    });
  }

  async generateSeats(sectorId: string, input: unknown) {
    const sector = await this.findSector(sectorId);
    const session = await this.findSession(sector.sessionId);
    await this.assertSectorHasNoOccupation(sectorId);

    if (session.seatingMode !== 'ASSIGNED') {
      throw new BadRequestException('Assentos so podem ser gerados em sessoes ASSIGNED.');
    }

    const existingSeats = await db
      .select({ id: seats.id })
      .from(seats)
      .where(eq(seats.sectorId, sectorId))
      .limit(1);

    if (existingSeats.length) {
      throw new ConflictException('Este setor ja possui assentos gerados.');
    }

    const body = asDict(input);
    const rows = requiredArray(body.rows, 'rows').map((row, index) =>
      requiredString(row, `rows[${index}]`),
    );
    const seatsPerRow = requiredPositiveInt(body.seatsPerRow, 'seatsPerRow');
    const startNumber =
      'startNumber' in body ? requiredPositiveInt(body.startNumber, 'startNumber') : 1;

    if (!rows.length) {
      throw new BadRequestException('Informe ao menos uma fileira.');
    }

    const values: (typeof seats.$inferInsert)[] = [];
    for (const rowLabel of rows) {
      for (let offset = 0; offset < seatsPerRow; offset++) {
        const seatNumber = startNumber + offset;
        values.push({
          sessionId: session.id,
          sectorId,
          label: `${rowLabel}${seatNumber}`,
          rowLabel,
          seatNumber,
        });
      }
    }

    return db.insert(seats).values(values).returning();
  }

  private async getAssignedAvailability(
    session: typeof sessions.$inferSelect,
    sectorList: SectorWithPrices[],
  ) {
    const sectorIds = sectorList.map((sector) => sector.id);
    const seatList = sectorIds.length
      ? await db
          .select()
          .from(seats)
          .where(inArray(seats.sectorId, sectorIds))
          .orderBy(asc(seats.rowLabel), asc(seats.seatNumber), asc(seats.label))
      : [];

    const seatIds = seatList.map((seat) => seat.id);
    const activeItems = seatIds.length
      ? await db
          .select({
            seatId: reservationItems.seatId,
            status: reservationItems.status,
          })
          .from(reservationItems)
          .where(
            and(
              inArray(reservationItems.seatId, seatIds),
              ne(reservationItems.status, 'RELEASED'),
            ),
          )
      : [];

    const statusBySeatId = new Map<string, string>();
    for (const item of activeItems) {
      if (item.seatId) statusBySeatId.set(item.seatId, item.status);
    }

    return {
      sessionId: session.id,
      seatingMode: session.seatingMode,
      sectors: sectorList.map((sector) => ({
        ...sector,
        seats: seatList
          .filter((seat) => seat.sectorId === sector.id)
          .map((seat) => ({
            id: seat.id,
            label: seat.label,
            rowLabel: seat.rowLabel,
            seatNumber: seat.seatNumber,
            status: statusBySeatId.get(seat.id) ?? 'AVAILABLE',
          })),
      })),
    };
  }

  private async getGeneralAvailability(
    session: typeof sessions.$inferSelect,
    sectorList: SectorWithPrices[],
  ) {
    const sectorIds = sectorList.map((sector) => sector.id);
    const activeItems = sectorIds.length
      ? await db
          .select({
            sectorId: reservationItems.sectorId,
            status: reservationItems.status,
          })
          .from(reservationItems)
          .where(
            and(
              inArray(reservationItems.sectorId, sectorIds),
              ne(reservationItems.status, 'RELEASED'),
            ),
          )
      : [];

    return {
      sessionId: session.id,
      seatingMode: session.seatingMode,
      sectors: sectorList.map((sector) => {
        const sectorItems = activeItems.filter((item) => item.sectorId === sector.id);
        const heldCount = sectorItems.filter((item) => item.status === 'HELD').length;
        const soldCount = sectorItems.filter((item) => item.status === 'SOLD').length;
        const occupiedCount = sectorItems.length;
        const capacity = sector.capacity ?? 0;

        return {
          ...sector,
          capacity,
          heldCount,
          soldCount,
          availableCount: Math.max(capacity - occupiedCount, 0),
        };
      }),
    };
  }

  private async getSectorsWithPrices(sessionId: string): Promise<SectorWithPrices[]> {
    const sectorList = await db
      .select()
      .from(sectors)
      .where(eq(sectors.sessionId, sessionId))
      .orderBy(asc(sectors.name));

    if (!sectorList.length) return [];

    const prices = await db
      .select()
      .from(sectorPrices)
      .where(
        inArray(
          sectorPrices.sectorId,
          sectorList.map((sector) => sector.id),
        ),
      )
      .orderBy(asc(sectorPrices.fareType));

    return sectorList.map((sector) => ({
      ...sector,
      prices: prices
        .filter((price) => price.sectorId === sector.id)
        .map((price) => ({
          id: price.id,
          fareType: price.fareType,
          priceCents: price.priceCents,
          currency: price.currency,
        })),
    }));
  }

  private async findEvent(eventId: string) {
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException('Evento nao encontrado.');
    return event;
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

  private async findSector(sectorId: string) {
    const [sector] = await db
      .select()
      .from(sectors)
      .where(eq(sectors.id, sectorId))
      .limit(1);
    if (!sector) throw new NotFoundException('Setor nao encontrado.');
    return sector;
  }

  private async assertSessionHasNoOccupation(sessionId: string) {
    const sectorList = await db
      .select({ id: sectors.id })
      .from(sectors)
      .where(eq(sectors.sessionId, sessionId));

    if (!sectorList.length) return;

    const occupied = await db
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(
        and(
          inArray(
            reservationItems.sectorId,
            sectorList.map((sector) => sector.id),
          ),
          ne(reservationItems.status, 'RELEASED'),
        ),
      )
      .limit(1);

    if (occupied.length) {
      throw new ConflictException('Sessao ja possui ocupacao ativa ou vendida.');
    }
  }

  private async assertSectorHasNoOccupation(sectorId: string) {
    const occupied = await db
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(
        and(
          eq(reservationItems.sectorId, sectorId),
          ne(reservationItems.status, 'RELEASED'),
        ),
      )
      .limit(1);

    if (occupied.length) {
      throw new ConflictException('Setor ja possui ocupacao ativa ou vendida.');
    }
  }
}

type SectorWithPrices = typeof sectors.$inferSelect & {
  prices: {
    id: string;
    fareType: FareType;
    priceCents: number;
    currency: string;
  }[];
};

function asDict(value: unknown, field = 'body'): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser um objeto.`);
  }
  return value as Dict;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} e obrigatorio.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} deve ser texto.`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiredDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new BadRequestException(`${field} deve ser uma data ISO.`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} deve ser uma data valida.`);
  }
  return date;
}

function requiredPositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} deve ser inteiro positivo.`);
  }
  return value;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser uma lista.`);
  }
  return value;
}

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} deve ser um de: ${allowed.join(', ')}.`);
  }
  return value as T;
}
