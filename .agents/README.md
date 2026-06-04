# Agents do Ticket System

Esta pasta guarda prompts reutilizaveis para continuar o desenvolvimento do novo backend de ingressos sem perder o fio das decisoes ja tomadas.

Use estes agents como blocos de trabalho. Antes de pedir uma implementacao grande, escolha o agent mais proximo da etapa atual e cole o prompt em uma nova conversa ou sub-tarefa.

## Fonte de verdade

Leia primeiro:

- `docs/regras-de-negocio.md`
- `docs/maquina-de-estados.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`

Quando houver conflito, a ordem de autoridade e:

1. Codigo ja implementado em `backend/src/db/schema.ts`
2. Decisoes fechadas em `docs/schema-do-banco.md`
3. Maquina de estados em `docs/maquina-de-estados.md`
4. Regras de negocio em `docs/regras-de-negocio.md`

Se um agent encontrar divergencia entre codigo e docs, ele deve parar e registrar a divergencia antes de propor mudanca.

## Como usar

- `project-context.md`: contexto compartilhado do produto e da arquitetura.
- `roadmap.md`: lista de etapas e criterio de pronto para cada uma.
- `current-status.md`: handoff da etapa atual.
- `response-template.md`: formato padrao de resposta para os agents.
- `prompts/*.md`: prompts por especialidade.

Fluxo recomendado para cada etapa:

1. Rodar o agent de arquitetura/revisao para fechar decisoes.
2. Rodar o agent de implementacao para mudar codigo.
3. Rodar o agent de testes/concorrencia quando houver corrida, TTL, pagamento ou fila.
4. Rodar o agent de documentacao para atualizar `docs`.

Para continuar exatamente de onde o projeto parou, comece por `current-status.md`.

## Contrato dos agents

Todo agent deve responder com:

- Premissas usadas.
- Arquivos lidos.
- Decisoes tomadas ou pendencias.
- Mudancas propostas ou implementadas.
- Testes/validacoes executados.

Todo agent deve evitar:

- Mudar regra de negocio aprovada sem avisar.
- Misturar mais de uma etapa grande sem necessidade.
- Criar abstracao nova quando o padrao existente resolve.
- Tratar Redis como fonte final de venda; o banco e a verdade final.
