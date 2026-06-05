# Etapa 3 — Schema do Banco

> Status: **implementada** (A e B aprovados; revisada para Etapa 4). Schema Drizzle + migration `0000_init` gerados.
> Stack: **PostgreSQL** (Neon/Supabase) + **Drizzle ORM**. Fonte de verdade final.
> Base: [regras-de-negocio.md](./regras-de-negocio.md) · [maquina-de-estados.md](./maquina-de-estados.md).
> Sem diagramas — só texto/tabelas. Próxima: Etapa 4 (eventos e assentos).

Decisões aplicadas (Etapa 3): events≠sessions (1:N); admissão geral via **setores**;
índice único parcial anti-dupla-venda; `reservation_items` para multi-assento;
identidade via **Supabase Auth** (sem tabela `users` própria); tarifa × classe
separadas; preços explícitos em `sector_prices`; **centavos + BRL**; PKs **UUID**
e status em **pgEnum**.

---

## Visão geral das tabelas

| Tabela | Papel |
|---|---|
| `events` | Atração/cartaz (filme, show). Pai de várias sessões. |
| `sessions` | Sessão específica: data/hora, sala, modo de assento, teto por usuário. |
| `sectors` | Setor da sessão (Plateia, Pista, Camarote): classe + capacidade. |
| `sector_prices` | Preços explícitos por setor e tarifa (`FULL`/`HALF`). |
| `seats` | Poltrona individual (**só modo `assigned`**). Pertence a um setor. |
| `reservations` | Carrinho/compra. Máquina de estados da Reserva. |
| `reservation_items` | Itens da reserva (1 por assento/vaga). Mora aqui o anti-dupla-venda. |
| `payments` | Tentativas de cobrança (N por reserva). |
| `tickets` | Ingresso emitido (1 por item). |
| `outbox_events` | Outbox transacional (detalhe na Etapa 11). |
| `idempotency_keys` | Chaves de idempotência (webhook/checkout — Etapa 10). |

**Identidade:** `user_id uuid` referencia o `auth.users` do Supabase. **Não** criamos
tabela `users` própria (no Supabase dá pra adicionar FK para `auth.users(id)`).

---

## Enums (pgEnum)

| Enum | Valores |
|---|---|
| `seating_mode` | `ASSIGNED`, `GENERAL` |
| `reservation_status` | `HELD`, `PAYMENT_PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, `FAILED` |
| `reservation_item_status` | `HELD`, `SOLD`, `RELEASED` |
| `payment_status` | `PENDING`, `PAID`, `FAILED`, `REFUNDED` |
| `ticket_status` | `PENDING_ISSUE`, `ISSUED`, `FAILED`, `CANCELLED` |
| `fare_type` | `FULL` (inteira), `HALF` (meia) |
| `seat_class` | `STANDARD`, `PREMIUM` |
| `outbox_status` | `PENDING`, `PROCESSED`, `FAILED` |
| `idempotency_status` | `IN_PROGRESS`, `COMPLETED` |

---

## Tabelas (colunas principais)

### events
- `id` uuid PK · `title` text NOT NULL · `description` text
- `created_at` / `updated_at` timestamptz

### sessions
- `id` uuid PK · `event_id` uuid FK→events NOT NULL
- `starts_at` timestamptz NOT NULL · `room` text (sala)
- `seating_mode` seating_mode NOT NULL
- `max_tickets_per_user` int NOT NULL  ← **teto, definido no cadastro (Q1)**
- `created_at` / `updated_at`
- Índice: `(event_id, starts_at)`
- *Cancelamento (regra 11): `agora < starts_at − 2h` é validado em código (derivado).*

### sectors
- `id` uuid PK · `session_id` uuid FK→sessions NOT NULL
- `name` text NOT NULL (ex.: "Plateia A", "Pista")
- `seat_class` seat_class NOT NULL
- `capacity` int NULL  ← obrigatório no modo `GENERAL`; no `ASSIGNED` é derivado de `seats`
- `created_at` / `updated_at`

### sector_prices
- `id` uuid PK · `sector_id` uuid FK→sectors NOT NULL
- `fare_type` fare_type NOT NULL
- `price_cents` int NOT NULL
- `currency` char(3) NOT NULL DEFAULT `'BRL'`
- `created_at` / `updated_at`
- **UNIQUE(`sector_id`, `fare_type`)** ← uma fonte de preço por tarifa no setor

### seats  *(só modo ASSIGNED)*
- `id` uuid PK · `session_id` uuid FK NOT NULL · `sector_id` uuid FK NOT NULL
- `label` text NOT NULL (ex.: "A12") · `row_label` text · `seat_number` int
- `created_at`
- **UNIQUE(`session_id`, `label`)**

### reservations
- `id` uuid PK · `session_id` uuid FK NOT NULL · `user_id` uuid NOT NULL (Supabase Auth)
- `status` reservation_status NOT NULL DEFAULT `HELD`
- `expires_at` timestamptz NULL  ← TTL de 7min; nulo após estado terminal/`CONFIRMED`
- `created_at` / `updated_at`
- **UNIQUE parcial (`session_id`, `user_id`) WHERE status IN (`HELD`,`PAYMENT_PENDING`)** ← regra 6
- Índice: `(status, expires_at)` (varreduras de expiração/reconciler)

### reservation_items
- `id` uuid PK · `reservation_id` uuid FK NOT NULL · `sector_id` uuid FK NOT NULL
- `seat_id` uuid FK NULL  ← nulo no modo `GENERAL`
- `fare_type` fare_type NOT NULL · `price_cents` int NOT NULL (snapshot do preço final)
- `status` reservation_item_status NOT NULL DEFAULT `HELD`
- `created_at` / `updated_at`
- **UNIQUE parcial (`seat_id`) WHERE status <> `RELEASED`** ← anti-dupla-venda (pergunta 3).
  Linhas com `seat_id` NULL (geral) são ignoradas pela unicidade automaticamente.
- Índice: `(reservation_id)`

### payments
- `id` uuid PK · `reservation_id` uuid FK NOT NULL
- `status` payment_status NOT NULL DEFAULT `PENDING`
- `amount_cents` int NOT NULL · `currency` char(3) NOT NULL DEFAULT `'BRL'`
- `provider` text NOT NULL DEFAULT `'mock'` · `provider_ref` text
- `created_at` / `updated_at`
- Índice: `(reservation_id)` — **sem** UNIQUE (várias tentativas por reserva, Q2)

### tickets
- `id` uuid PK · `reservation_item_id` uuid FK NOT NULL **UNIQUE** · `reservation_id` uuid FK NOT NULL
- `status` ticket_status NOT NULL DEFAULT `PENDING_ISSUE`
- `token` text UNIQUE NULL (QR/código — preenchido ao emitir) · `issued_at` timestamptz
- `created_at` / `updated_at`

### outbox_events  *(detalhe na Etapa 11)*
- `id` uuid PK · `aggregate_type` text NOT NULL · `aggregate_id` uuid NOT NULL
- `event_type` text NOT NULL · `payload` jsonb NOT NULL
- `status` outbox_status NOT NULL DEFAULT `PENDING` · `attempts` int NOT NULL DEFAULT 0
- `created_at` timestamptz · `processed_at` timestamptz
- Índice: `(status, created_at)`

### idempotency_keys  *(detalhe na Etapa 10)*
- `id` uuid PK · `scope` text NOT NULL (ex.: `payment_webhook`, `checkout`) · `key` text NOT NULL
- `request_hash` text · `status` idempotency_status NOT NULL DEFAULT `IN_PROGRESS`
- `response_status` int · `response_body` jsonb
- `created_at` timestamptz · `expires_at` timestamptz
- **UNIQUE(`scope`, `key`)**

---

## ⚠️ Dois pontos que divergem da imagem (preciso do seu ok)

**A) Unicidade do ticket.** A imagem propõe `UNIQUE(reservation_id)` em `tickets`
("evita dois ingressos para a mesma reserva"). Mas com **multi-assento**, uma reserva
gera **N ingressos** (um por assento) — então `UNIQUE(reservation_id)` quebraria o
caso de grupo. Troquei por **`UNIQUE(reservation_item_id)`**: garante 1 ingresso por
assento, que é o objetivo real. Confirma essa troca?

**B) Constraint de assento.** Mantive seu "recomendado" da pergunta 3, mas movi para
`reservation_items` como **`UNIQUE(seat_id) WHERE status <> 'RELEASED'`** (em vez de
`UNIQUE(event_id, seat_id, status)`). É o que de fato impede duas ocupações ativas no
mesmo assento. Ok?

---

## Notas de modelagem

- **Capacidade no modo GERAL** não dá pra impor por constraint relacional (é contagem
  de linhas vs. `sectors.capacity`). Na Etapa 7, ela passou a ser garantida no
  `add_to_cart` com `SELECT ... FOR UPDATE` na linha do setor. O banco continua
  sendo a verdade final via contagem de `reservation_items` ativos por setor.
- **Regra de meia-entrada** agora fica explícita em `sector_prices`; a aplicação
  escolhe a tarifa e `reservation_items.price_cents` guarda o **snapshot** do preço final.
- **`updated_at`** será mantido por trigger ou pela aplicação (decidir na implementação).

---

## Próximo passo

A Etapa 3 está implementada. A evolução de eventos, sessões, setores, preços e
assentos foi registrada em [eventos-e-assentos.md](./eventos-e-assentos.md).

---

## Implementação (arquivos)

- `backend/src/db/schema.ts` — 11 tabelas + 9 enums (pgEnum)
- `backend/src/db/index.ts` — cliente Drizzle (Pool `pg`)
- `backend/src/db/migrate.ts` — runner de migrations
- `backend/src/db/seed.ts` — seed (1 evento, sessão cinema + sessão show)
- `backend/drizzle.config.ts` · `.env.example`
- `backend/drizzle/0000_init.sql` — primeira migration
- Scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`

**Para rodar:** definir `DATABASE_URL` (Neon/Supabase) no `.env`, depois
`npm run db:migrate` e `npm run db:seed`. (Ainda não executado — sem `DATABASE_URL`.)

## Histórico

- Etapa 3 implementada: A (`tickets UNIQUE(reservation_item_id)`) e B (índice parcial
  em `reservation_items`) aprovados. Schema compila (`tsc --noEmit` ok) e migration
  `0000_init` gerada com os índices únicos parciais corretos.
- Revisão da Etapa 4: `base_price_cents` removido de `sectors`; preços passam para
  `sector_prices` com `UNIQUE(sector_id, fare_type)`.
