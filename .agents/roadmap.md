# Roadmap tecnico

## 1. Regras de negocio

Pronto quando as regras principais estiverem documentadas e pendencias explicitas.

Status atual: fechado.

## 2. Maquina de estados

Pronto quando Reserva, Pagamento e Ingresso tiverem estados, transicoes, atores, guardas e efeitos.

Status atual: proposta revisada.

## 3. Schema do banco

Pronto quando Drizzle schema, migration inicial e docs estiverem consistentes.

Status atual: implementado, em revisao.

Checklist de revisao:

- Enums batem com a maquina de estados.
- Indice parcial de reserva ativa cobre `HELD` e `PAYMENT_PENDING`.
- `reservation_items` suporta multi-assento e admissao geral.
- `tickets` tem unicidade por item, nao por reserva.
- Pagamentos aceitam varias tentativas por reserva.
- Outbox e idempotencia estao presentes sem detalhar comportamento antes das etapas 10 e 11.
- Migration bate com `schema.ts`.

## 4. Eventos e assentos

Pronto quando houver modelo de cadastro/seed/consulta para:

- Evento com varias sessoes.
- Sessao com `ASSIGNED` ou `GENERAL`.
- Setores com preco, classe e capacidade.
- Assentos por sessao/setor no modo `ASSIGNED`.
- Consulta de disponibilidade por sessao.

Status atual: implementado, aguardando revisao.

## 5. Reserva temporaria no banco

Pronto quando `add_to_cart` criar reserva e itens com TTL de 7 minutos e liberar corretamente em cancelamento/expiracao.

## 6. Redis para hold/TTL

Pronto quando a selecao efemera usar lock Redis de 30s e o backend diferenciar selecao de reserva persistida.

## 7. Concorrencia atomica

Pronto quando criacao de reserva e confirmacao de venda forem transacionais, cobrindo corrida entre usuarios e corrida contra expiracao.

## 8. BullMQ para expiracao

Pronto quando reservas expiradas forem processadas por job agendado/retryable e com logs observaveis.

## 9. Checkout/pagamento

Pronto quando checkout criar tentativa `payments(PENDING)` via provider mockado atras de interface.

## 10. Webhook idempotente

Pronto quando webhooks repetidos, fora de ordem e concorrentes nao dupliquem efeitos.

## 11. Outbox pattern

Pronto quando eventos de dominio relevantes forem persistidos na mesma transacao do estado que os gerou.

## 12. Fila de emissao de ingresso

Pronto quando pagamento confirmado gerar trabalho assincrono de emissao e ingressos avancarem para `ISSUED`.

## 13. Reconciler

Pronto quando pagamento aprovado depois da expiracao for resolvido: reconfirmar se ainda houver disponibilidade ou estornar.

## 14. Retries e jobs falhos

Pronto quando workers tiverem retry, backoff, DLQ/estado `FAILED` e caminho de reprocesso.

## 15. Observabilidade

Pronto quando logs, metricas e tracing minimo cobrirem reserva, pagamento, expiracao, webhook e emissao.

## 16. Testes de concorrencia

Pronto quando houver testes que simulem reservas simultaneas, expiracao vs pagamento e webhooks duplicados.

## 17. Painel/admin

Pronto quando houver visao operacional de eventos, assentos, reservas, pagamentos, jobs e falhas.

## 18. Documentacao

Pronto quando docs e codigo estiverem sincronizados e houver guia de operacao/desenvolvimento.
