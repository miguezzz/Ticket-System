import { sql } from 'drizzle-orm';
import {
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums (ver docs/maquina-de-estados.md e docs/schema-do-banco.md)
// ---------------------------------------------------------------------------
export const seatingMode = pgEnum('seating_mode', ['ASSIGNED', 'GENERAL']);

export const reservationStatus = pgEnum('reservation_status', [
  'HELD',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
]);

export const reservationItemStatus = pgEnum('reservation_item_status', [
  'HELD',
  'SOLD',
  'RELEASED',
]);

export const paymentStatus = pgEnum('payment_status', [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
]);

export const ticketStatus = pgEnum('ticket_status', [
  'PENDING_ISSUE',
  'ISSUED',
  'FAILED',
  'CANCELLED',
]);

export const fareType = pgEnum('fare_type', ['FULL', 'HALF']);

export const seatClass = pgEnum('seat_class', ['STANDARD', 'PREMIUM']);

export const outboxStatus = pgEnum('outbox_status', [
  'PENDING',
  'PROCESSED',
  'FAILED',
]);

export const idempotencyStatus = pgEnum('idempotency_status', [
  'IN_PROGRESS',
  'COMPLETED',
]);

// Colunas de timestamp reaproveitadas
const createdAt = timestamp('created_at', { withTimezone: true })
  .defaultNow()
  .notNull();
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .defaultNow()
  .notNull();

// ---------------------------------------------------------------------------
// events — atração/cartaz (pai de N sessões)
// ---------------------------------------------------------------------------
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt,
  updatedAt,
});

// ---------------------------------------------------------------------------
// sessions — sessão específica (data/hora, sala, modo de assento, teto)
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    room: text('room'),
    seatingMode: seatingMode('seating_mode').notNull(),
    maxTicketsPerUser: integer('max_tickets_per_user').notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index('sessions_event_starts_idx').on(t.eventId, t.startsAt)],
);

// ---------------------------------------------------------------------------
// sectors — setor da sessão (classe + capacidade)
//   GENERAL: capacity obrigatório · ASSIGNED: capacity derivado de seats
// ---------------------------------------------------------------------------
export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  seatClass: seatClass('seat_class').notNull(),
  capacity: integer('capacity'),
  createdAt,
  updatedAt,
});

// ---------------------------------------------------------------------------
// sector_prices — preços explícitos por setor/tarifa
// ---------------------------------------------------------------------------
export const sectorPrices = pgTable(
  'sector_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id, { onDelete: 'cascade' }),
    fareType: fareType('fare_type').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('sector_prices_sector_fare_uq').on(t.sectorId, t.fareType),
    index('sector_prices_sector_idx').on(t.sectorId),
  ],
);

// ---------------------------------------------------------------------------
// seats — poltrona individual (apenas modo ASSIGNED)
// ---------------------------------------------------------------------------
export const seats = pgTable(
  'seats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    rowLabel: text('row_label'),
    seatNumber: integer('seat_number'),
    createdAt,
  },
  (t) => [uniqueIndex('seats_session_label_uq').on(t.sessionId, t.label)],
);

// ---------------------------------------------------------------------------
// reservations — carrinho/compra (máquina de estados da Reserva)
// ---------------------------------------------------------------------------
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(), // Supabase Auth (auth.users.id)
    status: reservationStatus('status').notNull().default('HELD'),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // TTL 7min
    createdAt,
    updatedAt,
  },
  (t) => [
    // regra 6: 1 reserva ativa por usuário por sessão
    uniqueIndex('reservations_active_user_session_uq')
      .on(t.sessionId, t.userId)
      .where(sql`${t.status} in ('HELD','PAYMENT_PENDING')`),
    index('reservations_status_expires_idx').on(t.status, t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// reservation_items — itens (1 por assento/vaga); anti-dupla-venda mora aqui
// ---------------------------------------------------------------------------
export const reservationItems = pgTable(
  'reservation_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id),
    seatId: uuid('seat_id').references(() => seats.id), // null no modo GENERAL
    fareType: fareType('fare_type').notNull(),
    priceCents: integer('price_cents').notNull(), // snapshot do preço final
    status: reservationItemStatus('status').notNull().default('HELD'),
    createdAt,
    updatedAt,
  },
  (t) => [
    // no máx. 1 ocupação ativa por assento (linhas com seat_id NULL são ignoradas)
    uniqueIndex('reservation_items_seat_active_uq')
      .on(t.seatId)
      .where(sql`${t.status} <> 'RELEASED'`),
    index('reservation_items_reservation_idx').on(t.reservationId),
  ],
);

// ---------------------------------------------------------------------------
// payments — tentativas de cobrança (N por reserva, sem unique)
// ---------------------------------------------------------------------------
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    status: paymentStatus('status').notNull().default('PENDING'),
    amountCents: integer('amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    provider: text('provider').notNull().default('mock'),
    providerRef: text('provider_ref'),
    createdAt,
    updatedAt,
  },
  (t) => [index('payments_reservation_idx').on(t.reservationId)],
);

// ---------------------------------------------------------------------------
// tickets — ingresso emitido (1 por item de reserva)
// ---------------------------------------------------------------------------
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationItemId: uuid('reservation_item_id')
    .notNull()
    .unique()
    .references(() => reservationItems.id, { onDelete: 'cascade' }),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id, { onDelete: 'cascade' }),
  status: ticketStatus('status').notNull().default('PENDING_ISSUE'),
  token: text('token').unique(), // QR/código — preenchido ao emitir
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  createdAt,
  updatedAt,
});

// ---------------------------------------------------------------------------
// outbox_events — outbox transacional (detalhe na Etapa 11)
// ---------------------------------------------------------------------------
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    createdAt,
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_status_created_idx').on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------------------
// idempotency_keys — idempotência de webhook/checkout (detalhe na Etapa 10)
// ---------------------------------------------------------------------------
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash'),
    status: idempotencyStatus('status').notNull().default('IN_PROGRESS'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt,
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('idempotency_scope_key_uq').on(t.scope, t.key)],
);
