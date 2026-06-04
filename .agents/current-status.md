# Status atual

## Etapa em andamento

Etapa 4: Eventos e assentos.

A etapa 3 foi revisada para incluir `sector_prices` e remover `base_price_cents`.
A etapa 4 implementa catalogo publico e fluxo manual/admin sem auth por enquanto.

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

## Pergunta operacional do momento

Os endpoints e a disponibilidade da etapa 4 estao consistentes o bastante para seguir para "Reserva temporaria no banco"?

## Checks recomendados agora

- Rodar `npm run build` no backend.
- Conferir se `GET /sessions/:id/availability` retorna todos os assentos no modo `ASSIGNED`.
- Conferir se modo `GENERAL` retorna contadores por setor.
- Conferir se `/admin/sectors/:id/seats/generate` gera assentos com `rows + seatsPerRow + startNumber`.
- Conferir bloqueio de edicao quando existir `reservation_items.status <> RELEASED`.

## Prompt pronto para usar

Use com `.agents/prompts/03-eventos-assentos.md`:

```text
Revise a etapa 4 inteira antes de eu seguir para reserva temporaria no banco.

Quero saber se `docs/eventos-e-assentos.md`, `backend/src/events/*`, `backend/src/db/schema.ts` e `backend/src/db/seed.ts` estao consistentes com as decisoes tomadas.

Priorize achados que podem quebrar:

- cadastro manual/admin;
- precos explicitos em `sector_prices`;
- geracao simples de assentos;
- disponibilidade por assento/setor;
- bloqueio de edicao apos ocupacao.
```

## Criterio para fechar a etapa 4

A etapa 4 pode ser fechada quando:

- Catalogo publico expuser eventos, sessoes e disponibilidade.
- Admin/manual criar evento, sessao, setor, precos e assentos.
- O projeto compilar.
- Pendencias de auth, Redis e atomicidade estiverem marcadas para etapas futuras.
