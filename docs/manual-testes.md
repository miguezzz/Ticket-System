# Manual de Testes Manuais

> Objetivo: ter um roteiro simples para validar o backend atual sem depender do
> frontend. Cobre Etapa 4 (eventos/assentos), Etapa 5 (reserva temporaria no banco),
> Etapa 6 (Redis hold/TTL) e Etapa 7 (concorrencia atomica no add to cart).

---

## 1. Comandos mais usados

### Subir ambiente local com Postgres + backend

```bash
docker compose up --build backend
```

Rodar em segundo plano:

```bash
docker compose up -d --build backend
```

Ver status:

```bash
docker compose ps
```

Ver logs do backend:

```bash
docker compose logs backend --tail=100
```

Parar containers locais:

```bash
docker compose down
```

Parar e apagar volume local do Postgres:

```bash
docker compose down -v
```

### Rodar testes automatizados

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
```

O `build` garante que a imagem de teste contenha o codigo e os testes atuais.

### Build da imagem runtime

```bash
docker compose build backend
```

---

## 2. Rodar apontando para Supabase

Crie `.env` na raiz a partir de `.env.example` e preencha:

```env
DATABASE_URL=postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
RUN_MIGRATIONS=true
```

Subir backend usando Supabase:

```bash
docker compose -f docker-compose.supabase.yml up --build backend
```

Rodar em segundo plano:

```bash
docker compose -f docker-compose.supabase.yml up -d --build backend
```

Logs:

```bash
docker compose -f docker-compose.supabase.yml logs backend --tail=100
```

Rodar seed no Supabase:

```bash
docker compose -f docker-compose.supabase.yml run --rm backend-seed
```

> Cuidado: o seed cria dados reais no banco apontado pela `DATABASE_URL`.

---

## 3. Health check e catalogo

### Health

PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

curl:

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{ "status": "ok" }
```

### Listar eventos

```powershell
Invoke-RestMethod http://localhost:3000/events
```

Se o banco estiver vazio, resposta esperada:

```json
[]
```

---

## 4. Roteiro manual: criar cinema com assentos

PowerShell:

```powershell
$base = "http://localhost:3000"

$event = Invoke-RestMethod -Method Post -Uri "$base/admin/events" `
  -ContentType "application/json" `
  -Body (@{
    title = "Cinema Manual"
    description = "Criado no roteiro manual"
  } | ConvertTo-Json)

$session = Invoke-RestMethod -Method Post -Uri "$base/admin/events/$($event.id)/sessions" `
  -ContentType "application/json" `
  -Body (@{
    startsAt = (Get-Date).AddDays(7).ToString("o")
    room = "Sala 1"
    seatingMode = "ASSIGNED"
    maxTicketsPerUser = 4
  } | ConvertTo-Json)

$sector = Invoke-RestMethod -Method Post -Uri "$base/admin/sessions/$($session.id)/sectors" `
  -ContentType "application/json" `
  -Body (@{
    name = "Plateia"
    seatClass = "STANDARD"
  } | ConvertTo-Json)

Invoke-RestMethod -Method Put -Uri "$base/admin/sectors/$($sector.id)/prices" `
  -ContentType "application/json" `
  -Body (@{
    prices = @(
      @{ fareType = "FULL"; priceCents = 3000 },
      @{ fareType = "HALF"; priceCents = 1500 }
    )
  } | ConvertTo-Json -Depth 4)

$seats = Invoke-RestMethod -Method Post -Uri "$base/admin/sectors/$($sector.id)/seats/generate" `
  -ContentType "application/json" `
  -Body (@{
    rows = @("A", "B")
    seatsPerRow = 4
    startNumber = 1
  } | ConvertTo-Json)

$availability = Invoke-RestMethod "$base/sessions/$($session.id)/availability"

[pscustomobject]@{
  eventId = $event.id
  sessionId = $session.id
  sectorId = $sector.id
  firstSeatId = $seats[0].id
  firstSeatStatus = $availability.sectors[0].seats[0].status
}
```

Resultado esperado:

- `firstSeatStatus = AVAILABLE`
- 8 assentos criados (`A1..A4`, `B1..B4`)

---

## 5. Roteiro manual: criar reserva

Use o `sessionId` e o `firstSeatId` do passo anterior.

```powershell
$userId = [guid]::NewGuid().ToString()

$selection = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/selections"

Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/seats/$($seats[0].id)/hold" `
  -ContentType "application/json" `
  -Body (@{
    selectionId = $selection.selectionId
  } | ConvertTo-Json)

$availabilityAfterSelection = Invoke-RestMethod "$base/sessions/$($session.id)/availability?selectionId=$($selection.selectionId)"

$reservation = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/reservations" `
  -ContentType "application/json" `
  -Body (@{
    selectionId = $selection.selectionId
    userId = $userId
    items = @(
      @{ seatId = $seats[0].id; fareType = "FULL" }
    )
  } | ConvertTo-Json -Depth 4)

$availabilityAfterHold = Invoke-RestMethod "$base/sessions/$($session.id)/availability"

[pscustomobject]@{
  reservationId = $reservation.id
  status = $reservation.status
  expiresAt = $reservation.expiresAt
  totalItems = $reservation.totalItems
  totalCents = $reservation.totalCents
  selectedStatus = $availabilityAfterSelection.sectors[0].seats[0].status
  firstSeatStatus = $availabilityAfterHold.sectors[0].seats[0].status
}
```

Resultado esperado:

- `selectedStatus = SELECTED`
- `status = HELD`
- `totalItems = 1`
- `totalCents = 3000`
- `firstSeatStatus = UNAVAILABLE`
- `expiresAt` preenchido, aproximadamente 7 minutos no futuro

---

## 6. Roteiro manual: cancelar reserva

```powershell
$cancelled = Invoke-RestMethod -Method Post -Uri "$base/reservations/$($reservation.id)/cancel" `
  -ContentType "application/json" `
  -Body "{}"

$availabilityAfterCancel = Invoke-RestMethod "$base/sessions/$($session.id)/availability"

[pscustomobject]@{
  reservationStatus = $cancelled.status
  itemStatus = $cancelled.items[0].status
  firstSeatStatus = $availabilityAfterCancel.sectors[0].seats[0].status
}
```

Resultado esperado:

- `reservationStatus = CANCELLED`
- `itemStatus = RELEASED`
- `firstSeatStatus = AVAILABLE`

---

## 7. Roteiro manual: admissao geral

```powershell
$eventGeneral = Invoke-RestMethod -Method Post -Uri "$base/admin/events" `
  -ContentType "application/json" `
  -Body (@{
    title = "Show Manual"
    description = "Admissao geral"
  } | ConvertTo-Json)

$sessionGeneral = Invoke-RestMethod -Method Post -Uri "$base/admin/events/$($eventGeneral.id)/sessions" `
  -ContentType "application/json" `
  -Body (@{
    startsAt = (Get-Date).AddDays(14).ToString("o")
    room = "Arena"
    seatingMode = "GENERAL"
    maxTicketsPerUser = 4
  } | ConvertTo-Json)

$sectorGeneral = Invoke-RestMethod -Method Post -Uri "$base/admin/sessions/$($sessionGeneral.id)/sectors" `
  -ContentType "application/json" `
  -Body (@{
    name = "Pista"
    seatClass = "STANDARD"
    capacity = 10
  } | ConvertTo-Json)

Invoke-RestMethod -Method Put -Uri "$base/admin/sectors/$($sectorGeneral.id)/prices" `
  -ContentType "application/json" `
  -Body (@{
    prices = @(
      @{ fareType = "FULL"; priceCents = 8000 },
      @{ fareType = "HALF"; priceCents = 4000 }
    )
  } | ConvertTo-Json -Depth 4)

$selectionGeneral = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($sessionGeneral.id)/selections"

Invoke-RestMethod -Method Post -Uri "$base/sessions/$($sessionGeneral.id)/sectors/$($sectorGeneral.id)/hold" `
  -ContentType "application/json" `
  -Body (@{
    selectionId = $selectionGeneral.selectionId
    quantity = 2
  } | ConvertTo-Json)

$generalReservation = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($sessionGeneral.id)/reservations" `
  -ContentType "application/json" `
  -Body (@{
    selectionId = $selectionGeneral.selectionId
    userId = [guid]::NewGuid().ToString()
    items = @(
      @{ sectorId = $sectorGeneral.id; fareType = "FULL"; quantity = 2 }
    )
  } | ConvertTo-Json -Depth 4)

$generalAvailability = Invoke-RestMethod "$base/sessions/$($sessionGeneral.id)/availability"

[pscustomobject]@{
  reservationStatus = $generalReservation.status
  totalItems = $generalReservation.totalItems
  totalCents = $generalReservation.totalCents
  capacity = $generalAvailability.sectors[0].capacity
  unavailableCount = $generalAvailability.sectors[0].unavailableCount
  availableCount = $generalAvailability.sectors[0].availableCount
}
```

Resultado esperado:

- `reservationStatus = HELD`
- `totalItems = 2`
- `totalCents = 16000`
- `capacity = 10`
- `unavailableCount = 2`
- `availableCount = 8`

---

## 8. Roteiro manual: conflito de selecao

Use uma sessao `ASSIGNED` com ao menos um assento disponivel.

```powershell
$selectionA = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/selections"
$selectionB = Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/selections"

Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/seats/$($seats[1].id)/hold" `
  -ContentType "application/json" `
  -Body (@{
    selectionId = $selectionA.selectionId
  } | ConvertTo-Json)

try {
  Invoke-RestMethod -Method Post -Uri "$base/sessions/$($session.id)/seats/$($seats[1].id)/hold" `
    -ContentType "application/json" `
    -Body (@{
      selectionId = $selectionB.selectionId
    } | ConvertTo-Json)
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Resultado esperado:

- primeira selecao retorna `SELECTED`;
- segunda selecao retorna `409`.

As corridas de banco mais sensiveis ficam cobertas pelos testes automatizados:

- rollback de carrinho multi-assento quando um item conflita;
- capacidade `GENERAL` serializada com `FOR UPDATE`;
- limpeza de holds Redis apos conflito no banco.

---

## 9. Expirar reservas manualmente

O endpoint expira reservas com `expires_at <= now()`.

Para testar sem esperar 7 minutos, rode este SQL no Supabase SQL Editor ou no banco local:

```sql
update reservations
set expires_at = now() - interval '1 minute'
where status in ('HELD', 'PAYMENT_PENDING');
```

Depois chame:

```powershell
Invoke-RestMethod -Method Post -Uri "$base/admin/reservations/expire-due"
```

Resultado esperado:

```json
{
  "expiredCount": 1,
  "reservationIds": ["..."]
}
```

Depois consulte disponibilidade novamente. Assentos/setores devem voltar a ficar
disponiveis.

---

## 10. SQLs uteis no Supabase

### Ver tabelas principais

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

### Ver eventos e sessoes

```sql
select
  e.id as event_id,
  e.title,
  s.id as session_id,
  s.starts_at,
  s.room,
  s.seating_mode,
  s.max_tickets_per_user
from events e
join sessions s on s.event_id = e.id
order by s.starts_at;
```

### Ver setores e precos

```sql
select
  s.id as session_id,
  sec.id as sector_id,
  sec.name,
  sec.seat_class,
  sec.capacity,
  sp.fare_type,
  sp.price_cents,
  sp.currency
from sectors sec
join sessions s on s.id = sec.session_id
left join sector_prices sp on sp.sector_id = sec.id
order by s.starts_at, sec.name, sp.fare_type;
```

### Ver assentos e status de ocupacao

```sql
select
  seats.id as seat_id,
  seats.label,
  sectors.name as sector,
  coalesce(ri.status::text, 'AVAILABLE') as seat_status,
  ri.reservation_id
from seats
join sectors on sectors.id = seats.sector_id
left join reservation_items ri
  on ri.seat_id = seats.id
 and ri.status <> 'RELEASED'
order by sectors.name, seats.row_label, seats.seat_number, seats.label;
```

### Ver reservas com itens

```sql
select
  r.id as reservation_id,
  r.session_id,
  r.user_id,
  r.status as reservation_status,
  r.expires_at,
  ri.id as item_id,
  ri.status as item_status,
  ri.sector_id,
  ri.seat_id,
  ri.fare_type,
  ri.price_cents
from reservations r
left join reservation_items ri on ri.reservation_id = r.id
order by r.created_at desc, ri.created_at;
```

### Ver reservas ativas

```sql
select *
from reservations
where status in ('HELD', 'PAYMENT_PENDING')
order by expires_at;
```

### Ver assentos indisponiveis

```sql
select
  ri.seat_id,
  seats.label,
  ri.status,
  ri.reservation_id
from reservation_items ri
join seats on seats.id = ri.seat_id
where ri.status <> 'RELEASED'
order by seats.label;
```

### Ver contagem por setor no modo GENERAL

```sql
select
  sec.id as sector_id,
  sec.name,
  sec.capacity,
  count(ri.id) filter (where ri.status = 'HELD') as held_count,
  count(ri.id) filter (where ri.status = 'SOLD') as sold_count,
  sec.capacity - count(ri.id) filter (where ri.status <> 'RELEASED') as available_count
from sectors sec
left join reservation_items ri on ri.sector_id = sec.id
group by sec.id, sec.name, sec.capacity
order by sec.name;
```

### Ver se indice de reserva ativa existe

```sql
select indexname, indexdef
from pg_indexes
where tablename in ('reservations', 'reservation_items', 'sector_prices', 'seats')
order by tablename, indexname;
```

---

## 11. SQLs de limpeza

### Limpar tudo em banco de desenvolvimento

Use apenas em banco de desenvolvimento/teste.

```sql
truncate
  tickets,
  payments,
  reservation_items,
  reservations,
  seats,
  sector_prices,
  sectors,
  sessions,
  events,
  outbox_events,
  idempotency_keys
restart identity cascade;
```

### Liberar reservas ativas sem apagar catalogo

```sql
update reservation_items
set status = 'RELEASED', updated_at = now()
where status <> 'RELEASED';

update reservations
set status = 'CANCELLED', expires_at = null, updated_at = now()
where status in ('HELD', 'PAYMENT_PENDING');
```

---

## 12. Coisas que ainda nao existem

- BullMQ expirando reservas automaticamente.
- Checkout/pagamento.
- Webhook idempotente.
- Emissao de ingresso.
- Auth real/admin guard.
- Frontend integrado ao novo backend.

Se algum teste manual depender de uma dessas coisas, ele ainda nao deve passar:
isso e esperado neste ponto do roadmap.
