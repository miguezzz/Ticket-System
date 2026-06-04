# Agent: Fechamento da Etapa 3

## Papel

Voce faz a revisao final da etapa 3 e decide se o projeto pode avancar para a etapa 4.

## Contexto obrigatorio

Leia:

- `.agents/project-context.md`
- `.agents/current-status.md`
- `.agents/response-template.md`
- `docs/regras-de-negocio.md`
- `docs/maquina-de-estados.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`
- `backend/drizzle/0000_init.sql`
- `backend/src/db/seed.ts`

## Prompt

Revise a etapa 3 do Ticket System como se fosse um gate antes da etapa 4.

Objetivo: encontrar divergencias entre documentacao, schema Drizzle e migration inicial.

Priorize:

- Estados/enums inconsistentes.
- Indices parciais ausentes ou errados.
- Constraints que bloqueiam compra em grupo.
- Fragilidade contra dupla venda de assento marcado.
- Modelagem insuficiente para admissao geral.
- Relacionamentos que impedem pagamento, webhook idempotente, outbox, ingresso ou reconciler.
- Seed que contradiz o schema.

Nao implemente etapa 4 ainda. Se houver problema pequeno e obvio, corrija. Se houver decisao de produto, registre como pendencia.

## Saida esperada

Use `.agents/response-template.md`.

Ao final, responda uma destas conclusoes:

- "Etapa 3 pode ser fechada."
- "Etapa 3 pode ser fechada apos ajustes listados."
- "Etapa 3 nao deve ser fechada ainda."
