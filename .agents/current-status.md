# Status atual

## Etapa em andamento

Etapa 8: BullMQ para expiracao.

A etapa 7 fechou a atomicidade do `add_to_cart`: assento marcado usa constraint
parcial no banco como garantia final, admissao geral usa `SELECT ... FOR UPDATE`
na linha do setor, e conflitos limpam os holds Redis do request.

## Arquivos principais

- `docs/regras-de-negocio.md`
- `docs/maquina-de-estados.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`
- `backend/drizzle/0000_init.sql`
- `backend/src/db/index.ts`
- `backend/src/db/migrate.ts`
- `backend/src/db/seed.ts`
- `docs/eventos-e-assentos.md`
- `backend/src/events/events.controller.ts`
- `backend/src/events/admin-events.controller.ts`
- `backend/src/events/events.service.ts`
- `docs/reserva-temporaria-no-banco.md`
- `docs/redis-hold-ttl.md`
- `docs/concorrencia-atomica.md`
- `docs/testing-e-ci.md`
- `backend/src/holds/holds.controller.ts`
- `backend/src/holds/holds.service.ts`
- `backend/src/holds/redis.service.ts`
- `backend/src/reservations/reservations.controller.ts`
- `backend/src/reservations/reservations.service.ts`
- `backend/test/reservations.e2e-spec.ts`

## Pergunta operacional do momento

Como o BullMQ deve agendar e processar a expiracao das reservas persistidas?

## Checks recomendados agora

- Rodar `docker compose --profile test build backend-test`.
- Rodar `docker compose --profile test run --rm backend-test`.
- Criar `selectionId` com `POST /sessions/:id/selections`.
- Testar hold de assento com `POST /sessions/:id/seats/:seatId/hold`.
- Testar disponibilidade com `selectionId`, esperando `SELECTED`.
- Testar disponibilidade sem `selectionId`, esperando `UNAVAILABLE`.
- Testar `POST /sessions/:id/reservations` exigindo `selectionId`.
- Testar reserva `GENERAL` por setor/quantidade com hold Redis previo.
- Testar conflito multi-assento com rollback completo.
- Testar corrida de capacidade em sessao `GENERAL`.
- Conferir snapshot de preco em `reservation_items.price_cents`.
- Testar cancelamento e `POST /admin/reservations/expire-due`.
- Conferir disponibilidade apos reserva/cancelamento/expiracao.

## Prompt pronto para usar

Use com `.agents/prompts/04-concorrencia-redis-bullmq.md` ou um agent de revisao:

```text
Revise a etapa 7 antes de eu seguir para BullMQ.

Quero saber se `docs/concorrencia-atomica.md`, `backend/src/reservations/*`,
`backend/src/holds/*` e `backend/test/reservations.e2e-spec.ts` estao consistentes.

Priorize achados que podem quebrar:

- atomicidade do carrinho multi-item;
- conflito de assento marcado via constraint parcial;
- capacidade de admissao geral com `FOR UPDATE`;
- limpeza de Redis hold apos conflito;
- expiracao oportunista antes de contar disponibilidade.
```

## Criterio para fechar a etapa 7

A etapa 7 pode ser considerada fechada porque:

- `ASSIGNED` tem garantia final no banco contra assento duplicado.
- `GENERAL` serializa capacidade por linha de setor.
- Carrinho multi-item faz rollback completo em conflito.
- Holds Redis sao limpos quando o banco recusa a reserva.
- Testes e2e passam via Docker.
- O projeto compilar.
- Pendencias de BullMQ e pagamento estao marcadas para etapas futuras.
