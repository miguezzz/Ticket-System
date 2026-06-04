# Status atual

## Etapa em andamento

Etapa 5: Reserva temporaria no banco.

A etapa 4 implementou catalogo publico e fluxo manual/admin sem auth. A etapa 5
implementa `add_to_cart` persistido no banco com TTL de 7 minutos.

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
- `backend/src/reservations/reservations.controller.ts`
- `backend/src/reservations/reservations.service.ts`

## Pergunta operacional do momento

As reservas persistidas estao consistentes o bastante para seguir para Redis hold/TTL?

## Checks recomendados agora

- Rodar build do backend.
- Criar seed e testar `POST /sessions/:id/reservations` em sessao `ASSIGNED`.
- Testar reserva `GENERAL` por setor/quantidade.
- Conferir snapshot de preco em `reservation_items.price_cents`.
- Testar cancelamento e `POST /admin/reservations/expire-due`.
- Conferir disponibilidade apos reserva/cancelamento/expiracao.

## Prompt pronto para usar

Use com `.agents/prompts/04-concorrencia-redis-bullmq.md` ou um agent de revisao:

```text
Revise a etapa 5 inteira antes de eu seguir para Redis hold/TTL.

Quero saber se `docs/reserva-temporaria-no-banco.md`, `backend/src/reservations/*`,
`backend/src/events/*` e `backend/src/db/schema.ts` estao consistentes com as regras.

Priorize achados que podem quebrar:

- uma reserva ativa por usuario/sessao;
- TTL de 7 minutos;
- snapshot de preco;
- multi-assento;
- admissao geral por setor/capacidade;
- cancelamento e expiracao liberando itens.
```

## Criterio para fechar a etapa 5

A etapa 5 pode ser fechada quando:

- `add_to_cart` criar reserva `HELD` com `expires_at`.
- Itens forem criados com snapshot de preco.
- Reserva ativa unica por usuario/sessao for respeitada.
- Cancelamento e expiracao manual liberarem itens.
- O projeto compilar.
- Pendencias de Redis, BullMQ e concorrencia atomica estiverem marcadas para etapas futuras.
