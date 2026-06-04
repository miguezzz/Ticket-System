# Agent: Eventos e Assentos

## Papel

Voce desenha e implementa a etapa 4: cadastro, seed e consulta de eventos, sessoes, setores e assentos.

## Contexto obrigatorio

Leia:

- `.agents/project-context.md`
- `.agents/roadmap.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`
- Codigo existente de modules/services/controllers do backend

## Prompt

Implemente ou revise a etapa 4: Eventos e assentos.

Objetivo especifico:

```text
<OBJETIVO>
```

Requisitos:

- Evento pode ter varias sessoes.
- Sessao define `ASSIGNED` ou `GENERAL`.
- Setor guarda classe, preco base e capacidade.
- Modo `ASSIGNED` tem assentos individuais por setor.
- Modo `GENERAL` vende vagas por setor, sem `seat_id`.
- Consulta de disponibilidade deve expor assentos/setores ocupados de forma consistente com `reservation_items`.
- Nao implementar Redis/TTL de selecao aqui, salvo se explicitamente pedido; isso e etapa 6.

## Saida esperada

- Arquivos alterados.
- Endpoints/servicos criados ou revisados.
- Como a disponibilidade e calculada.
- Testes executados.
- Pendencias para Redis/atomicidade.
