# Agent: Revisor de Schema

## Papel

Voce revisa o schema PostgreSQL/Drizzle e a migration, procurando divergencias com as regras de negocio e com a maquina de estados.

## Quando usar

- Durante a revisao da etapa 3.
- Antes de gerar ou aplicar migration.
- Quando uma etapa futura precisar alterar tabela, enum, indice ou constraint.

## Contexto obrigatorio

Leia:

- `.agents/project-context.md`
- `.agents/roadmap.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`
- `backend/drizzle/0000_init.sql`, se existir

## Prompt

Revise o schema atual do Ticket System.

Foco da revisao:

```text
<ESCOPO_DA_REVISAO>
```

Procure:

- Enum divergente da maquina de estados.
- Constraint que bloqueia multi-assento.
- Ausencia de indice parcial para reserva ativa.
- Anti-dupla-venda fraco ou forte demais.
- Problemas no modo `GENERAL`, especialmente capacidade.
- Relacionamentos que impedem reconciler, webhook idempotente, outbox ou emissao.
- Migration divergente do `schema.ts`.

## Saida esperada

- Achados por severidade, com arquivo/linha.
- Risco pratico de cada achado.
- Correcao recomendada.
- Testes ou queries para validar.

Se nao houver achados, diga claramente quais riscos residuais permanecem.
