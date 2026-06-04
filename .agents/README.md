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

## Gate obrigatorio de decisao

- Nenhum agent deve tomar decisoes novas de arquitetura, regra de negocio, design de produto, contrato de API, schema, infraestrutura ou fluxo de estado sem perguntar antes.
- Ambiguidades devem ser explicitadas e debatidas antes de serem solucionadas.
- Quando houver mais de uma solucao plausivel, o agent deve apresentar opcoes, trade-offs e uma recomendacao, mas aguardar decisao do usuario antes de implementar.
- O agent so pode implementar sem perguntar quando a decisao ja estiver documentada, for uma correcao mecanica de bug/teste, ou for consequencia direta e incontestavel de uma decisao aprovada.
- Toda decisao nova aprovada deve ser registrada nos docs da etapa correspondente.
- Se uma ambiguidade bloquear a etapa, o status correto e `bloqueado`, nao uma implementacao baseada em suposicao.

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
5. Rodar a suite completa de testes antes de avancar para a proxima etapa.

Para continuar exatamente de onde o projeto parou, comece por `current-status.md`.

## Gate obrigatorio de testes

- Toda etapa implementada deve criar ou atualizar testes automatizados proporcionais ao risco da mudanca.
- Entre etapas, a suite de testes deve ser executada e precisa passar 100%.
- Se algum teste falhar, a etapa fica bloqueada ate corrigir o codigo ou o teste.
- Nenhum teste deve ser deletado, nunca.
- Se um teste ficar obsoleto por mudanca legitima de regra, ele deve ser atualizado para a nova regra, preservando a cobertura equivalente ou melhor.
- Se nao for possivel rodar testes por problema de ambiente, o agent deve registrar o bloqueio e nao marcar a etapa como pronta.
- Validacoes manuais podem complementar, mas nao substituem testes automatizados quando houver codigo executavel.

## Contrato dos agents

Todo agent deve responder com:

- Premissas usadas.
- Arquivos lidos.
- Ambiguidades encontradas e perguntas feitas.
- Decisoes tomadas ou pendencias.
- Mudancas propostas ou implementadas.
- Testes/validacoes executados.
- Confirmacao explicita de que todos os testes passaram antes de recomendar avancar.

Todo agent deve evitar:

- Mudar regra de negocio aprovada sem avisar.
- Tomar decisao de arquitetura, regra de negocio, design, API, schema, infra ou estado sem perguntar.
- Resolver ambiguidade no chute.
- Misturar mais de uma etapa grande sem necessidade.
- Criar abstracao nova quando o padrao existente resolve.
- Tratar Redis como fonte final de venda; o banco e a verdade final.
- Deletar testes existentes.
- Avancar etapa com teste falhando ou sem rodar a suite.
