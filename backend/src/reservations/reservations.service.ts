import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  reservationItems,
  reservations,
  seats,
  sectorPrices,
  sectors,
  sessions,
} from '../db/schema';

const RESERVATION_TTL_MS = 7 * 60 * 1000;

type Dict = Record<string, unknown>;
type FareType = 'FULL' | 'HALF';

type RequestedItem =
  | {
      kind: 'ASSIGNED';
      seatId: string;
      fareType: FareType;
    }
  | {
      kind: 'GENERAL';
      sectorId: string;
      fareType: FareType;
      quantity: number;
    };

type ReservationItemDraft = Omit<typeof reservationItems.$inferInsert, 'reservationId'>;

@Injectable()
export class ReservationsService {
  async createReservation(sessionId: string, input: unknown) {
    const session = await this.findSession(sessionId);
    const body = asDict(input);
    const userId = requiredUuid(body.userId, 'userId');
    const requestedItems = this.parseItems(body.items, session.seatingMode);
    const requestedTicketCount = requestedItems.reduce(
      (sum, item) => sum + (item.kind === 'GENERAL' ? item.quantity : 1),
      0,
    );

    if (requestedTicketCount > session.maxTicketsPerUser) {
      throw new BadRequestException(
        `Reserva excede o limite de ${session.maxTicketsPerUser} ingressos por usuario.`,
      );
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    try {
      return await db.transaction(async (tx) => {
        await this.releaseExpiredActiveReservation(tx, sessionId, userId);
        await this.assertNoActiveReservation(tx, sessionId, userId);
        await this.assertUserTicketLimit(tx, sessionId, userId, requestedTicketCount);

        const itemsToInsert =
          session.seatingMode === 'ASSIGNED'
            ? await this.buildAssignedItems(tx, sessionId, requestedItems)
            : await this.buildGeneralItems(tx, sessionId, requestedItems);

        const [reservation] = await tx
          .insert(reservations)
          .values({
            sessionId,
            userId,
            status: 'HELD',
            expiresAt,
          })
          .returning();

        const items = await tx
          .insert(reservationItems)
          .values(
            itemsToInsert.map((item) => ({
              ...item,
              reservationId: reservation.id,
            })),
          )
          .returning();

        return {
          ...reservation,
          items,
          totalItems: items.length,
          totalCents: items.reduce((sum, item) => sum + item.priceCents, 0),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Algum assento ou reserva ativa ja foi ocupado.');
      }
      throw error;
    }
  }

  async getReservation(reservationId: string) {
    const [reservation] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);

    if (!reservation) throw new NotFoundException('Reserva nao encontrada.');

    const items = await db
      .select()
      .from(reservationItems)
      .where(eq(reservationItems.reservationId, reservationId));

    return {
      ...reservation,
      items,
      totalItems: items.length,
      totalCents: items.reduce((sum, item) => sum + item.priceCents, 0),
    };
  }

  async cancelReservation(reservationId: string, input: unknown) {
    const body = input === undefined ? {} : asDict(input);
    const userId =
      'userId' in body && body.userId !== undefined
        ? requiredUuid(body.userId, 'userId')
        : null;

    return db.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .limit(1);

      if (!reservation) throw new NotFoundException('Reserva nao encontrada.');
      if (userId && reservation.userId !== userId) {
        throw new ConflictException('Reserva pertence a outro usuario.');
      }
      if (!['HELD', 'PAYMENT_PENDING'].includes(reservation.status)) {
        throw new ConflictException('Apenas reservas ativas podem ser canceladas.');
      }

      await tx
        .update(reservationItems)
        .set({ status: 'RELEASED', updatedAt: new Date() })
        .where(eq(reservationItems.reservationId, reservationId));

      const [cancelled] = await tx
        .update(reservations)
        .set({
          status: 'CANCELLED',
          expiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, reservationId))
        .returning();

      return this.withItems(tx, cancelled);
    });
  }

  async expireDueReservations() {
    const now = new Date();

    return db.transaction(async (tx) => {
      const dueReservations = await tx
        .select()
        .from(reservations)
        .where(
          and(
            inArray(reservations.status, ['HELD', 'PAYMENT_PENDING']),
            sql`${reservations.expiresAt} <= ${now}`,
          ),
        );

      if (!dueReservations.length) {
        return { expiredCount: 0, reservationIds: [] };
      }

      const reservationIds = dueReservations.map((reservation) => reservation.id);

      await tx
        .update(reservationItems)
        .set({ status: 'RELEASED', updatedAt: now })
        .where(inArray(reservationItems.reservationId, reservationIds));

      await tx
        .update(reservations)
        .set({ status: 'EXPIRED', expiresAt: null, updatedAt: now })
        .where(inArray(reservations.id, reservationIds));

      return {
        expiredCount: reservationIds.length,
        reservationIds,
      };
    });
  }

  private async buildAssignedItems(
    tx: Tx,
    sessionId: string,
    requestedItems: RequestedItem[],
  ): Promise<ReservationItemDraft[]> {
    const assignedItems = requestedItems.filter((item) => item.kind === 'ASSIGNED');
    const seatIds = assignedItems.map((item) => item.seatId);

    if (new Set(seatIds).size !== seatIds.length) {
      throw new BadRequestException('Nao repita seatId na mesma reserva.');
    }

    const seatRows = await tx
      .select({
        seatId: seats.id,
        sectorId: seats.sectorId,
      })
      .from(seats)
      .where(and(eq(seats.sessionId, sessionId), inArray(seats.id, seatIds)));

    if (seatRows.length !== seatIds.length) {
      throw new BadRequestException('Um ou mais assentos nao pertencem a sessao.');
    }

    await this.assertSeatsAvailable(tx, seatIds);

    const prices = await this.getPricesForSectors(
      tx,
      Array.from(new Set(seatRows.map((seat) => seat.sectorId))),
    );

    return assignedItems.map((item) => {
      const seat = seatRows.find((row) => row.seatId === item.seatId);
      if (!seat) throw new BadRequestException('Assento invalido.');

      return {
        sectorId: seat.sectorId,
        seatId: seat.seatId,
        fareType: item.fareType,
        priceCents: this.findPrice(prices, seat.sectorId, item.fareType),
        status: 'HELD',
      };
    });
  }

  private async buildGeneralItems(
    tx: Tx,
    sessionId: string,
    requestedItems: RequestedItem[],
  ): Promise<ReservationItemDraft[]> {
    const generalItems = requestedItems.filter((item) => item.kind === 'GENERAL');
    const sectorIds = generalItems.map((item) => item.sectorId);

    const sectorRows = await tx
      .select({
        sectorId: sectors.id,
        capacity: sectors.capacity,
      })
      .from(sectors)
      .where(and(eq(sectors.sessionId, sessionId), inArray(sectors.id, sectorIds)));

    if (sectorRows.length !== new Set(sectorIds).size) {
      throw new BadRequestException('Um ou mais setores nao pertencem a sessao.');
    }

    await this.assertGeneralCapacity(tx, generalItems, sectorRows);

    const prices = await this.getPricesForSectors(tx, Array.from(new Set(sectorIds)));
    const rows: ReservationItemDraft[] = [];

    for (const item of generalItems) {
      const priceCents = this.findPrice(prices, item.sectorId, item.fareType);
      for (let i = 0; i < item.quantity; i++) {
        rows.push({
          sectorId: item.sectorId,
          seatId: null,
          fareType: item.fareType,
          priceCents,
          status: 'HELD',
        });
      }
    }

    return rows;
  }

  private async assertSeatsAvailable(tx: Tx, seatIds: string[]) {
    const occupied = await tx
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(
        and(
          inArray(reservationItems.seatId, seatIds),
          ne(reservationItems.status, 'RELEASED'),
        ),
      )
      .limit(1);

    if (occupied.length) {
      throw new ConflictException('Um ou mais assentos ja estao indisponiveis.');
    }
  }

  private async assertGeneralCapacity(
    tx: Tx,
    requestedItems: Extract<RequestedItem, { kind: 'GENERAL' }>[],
    sectorRows: { sectorId: string; capacity: number | null }[],
  ) {
    for (const sector of sectorRows) {
      if (sector.capacity === null) {
        throw new BadRequestException('Setor GENERAL precisa ter capacity.');
      }

      const requestedQuantity = requestedItems
        .filter((item) => item.sectorId === sector.sectorId)
        .reduce((sum, item) => sum + item.quantity, 0);

      const activeItems = await tx
        .select({ id: reservationItems.id })
        .from(reservationItems)
        .where(
          and(
            eq(reservationItems.sectorId, sector.sectorId),
            ne(reservationItems.status, 'RELEASED'),
          ),
        );

      if (activeItems.length + requestedQuantity > sector.capacity) {
        throw new ConflictException('Capacidade insuficiente no setor.');
      }
    }
  }

  private async assertNoActiveReservation(tx: Tx, sessionId: string, userId: string) {
    const active = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.sessionId, sessionId),
          eq(reservations.userId, userId),
          inArray(reservations.status, ['HELD', 'PAYMENT_PENDING']),
        ),
      )
      .limit(1);

    if (active.length) {
      throw new ConflictException('Usuario ja possui reserva ativa nesta sessao.');
    }
  }

  private async assertUserTicketLimit(
    tx: Tx,
    sessionId: string,
    userId: string,
    requestedTicketCount: number,
  ) {
    const activeItems = await tx
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .innerJoin(reservations, eq(reservationItems.reservationId, reservations.id))
      .where(
        and(
          eq(reservations.sessionId, sessionId),
          eq(reservations.userId, userId),
          inArray(reservations.status, ['HELD', 'PAYMENT_PENDING']),
          ne(reservationItems.status, 'RELEASED'),
        ),
      );

    const [session] = await tx
      .select({ maxTicketsPerUser: sessions.maxTicketsPerUser })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (activeItems.length + requestedTicketCount > session.maxTicketsPerUser) {
      throw new BadRequestException(
        `Usuario excede o limite de ${session.maxTicketsPerUser} ingressos por sessao.`,
      );
    }
  }

  private async releaseExpiredActiveReservation(tx: Tx, sessionId: string, userId: string) {
    const now = new Date();
    const expiredActive = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.sessionId, sessionId),
          eq(reservations.userId, userId),
          inArray(reservations.status, ['HELD', 'PAYMENT_PENDING']),
          sql`${reservations.expiresAt} <= ${now}`,
        ),
      );

    if (!expiredActive.length) return;

    const reservationIds = expiredActive.map((reservation) => reservation.id);

    await tx
      .update(reservationItems)
      .set({ status: 'RELEASED', updatedAt: now })
      .where(inArray(reservationItems.reservationId, reservationIds));

    await tx
      .update(reservations)
      .set({ status: 'EXPIRED', expiresAt: null, updatedAt: now })
      .where(inArray(reservations.id, reservationIds));
  }

  private async getPricesForSectors(tx: Tx, sectorIds: string[]) {
    return tx
      .select()
      .from(sectorPrices)
      .where(inArray(sectorPrices.sectorId, sectorIds));
  }

  private findPrice(
    prices: (typeof sectorPrices.$inferSelect)[],
    sectorId: string,
    fareType: FareType,
  ) {
    const price = prices.find(
      (row) => row.sectorId === sectorId && row.fareType === fareType,
    );

    if (!price) {
      throw new BadRequestException('Preco nao configurado para setor/tarifa.');
    }

    return price.priceCents;
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

  private async withItems(tx: Tx, reservation: typeof reservations.$inferSelect) {
    const items = await tx
      .select()
      .from(reservationItems)
      .where(eq(reservationItems.reservationId, reservation.id));

    return {
      ...reservation,
      items,
      totalItems: items.length,
      totalCents: items.reduce((sum, item) => sum + item.priceCents, 0),
    };
  }

  private parseItems(value: unknown, seatingMode: string): RequestedItem[] {
    const rawItems = requiredArray(value, 'items');
    if (!rawItems.length) throw new BadRequestException('Informe ao menos um item.');

    return rawItems.map((raw, index) => {
      const item = asDict(raw, `items[${index}]`);
      const fareType = requiredEnum<FareType>(
        item.fareType,
        ['FULL', 'HALF'],
        `items[${index}].fareType`,
      );

      if (seatingMode === 'ASSIGNED') {
        return {
          kind: 'ASSIGNED',
          seatId: requiredUuid(item.seatId, `items[${index}].seatId`),
          fareType,
        };
      }

      return {
        kind: 'GENERAL',
        sectorId: requiredUuid(item.sectorId, `items[${index}].sectorId`),
        fareType,
        quantity:
          'quantity' in item
            ? requiredPositiveInt(item.quantity, `items[${index}].quantity`)
            : 1,
      };
    });
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function asDict(value: unknown, field = 'body'): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser um objeto.`);
  }
  return value as Dict;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser uma lista.`);
  }
  return value;
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

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
