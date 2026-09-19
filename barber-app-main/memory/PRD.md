# Barbearia Imperial — PRD

## Problem Statement (original)
Aplicativo full-stack de gestão e agendamento para barbearia com dois perfis (Cliente e Admin/Barbeiro):
- Cliente: cadastro com tipo de cabelo, agendamento inteligente (slots calculados dinamicamente), cortesias, upsell por tipo de cabelo, checkout PIX/na loja, cartão fidelidade (10 selos → 50% no 11º).
- Admin/Barbeiro: agenda diária/mensal, expediente + exceções, CRUD serviços/produtos/estoque/cortesias, relatórios financeiros bruto/líquido separados por serviços vs produtos.

## Stack
- Backend: FastAPI + Motor (MongoDB), JWT auth (bcrypt), Pydantic v2.
- Frontend: React + shadcn/ui + Tailwind (PT-BR, dark mode).
- Idioma: Português do Brasil.

## User personas
- Cliente final: agenda pelo celular, escolhe barbeiro, serviço, cortesia, produto sugerido.
- Barbeiro/Admin: gerencia agenda, expediente, catálogo e vê relatórios.

## Core requirements (estáticos)
1. Cadastro com hair_type obrigatório para CLIENT.
2. Motor de slots: cruza expediente + duração do serviço + reservas existentes, passo de 30 min.
3. Cortesias sinalizáveis no checkout.
4. Upsell filtrado por hair_type com 10% de desconto quando comprado junto.
5. Baixa automática de estoque.
6. Fidelidade: +1 selo por COMPLETED, 50% off no 11º atendimento.
7. Pagamento: PIX_APP (mock) ou IN_PERSON.
8. Painel admin com agenda + relatórios.

## Implementado (fev/2026)
- Auth JWT (register/login/me) — hair_type validado.
- Seed idempotente de admin + barbeiro + serviços + produtos + cortesias + agenda semanal.
- Catálogo, slots dinâmicos, criação de agendamento, listagem "minha agenda".
- Admin: agenda geral, marcar como concluído (gera selo de fidelidade), relatórios.
- CRUDs admin: serviços, produtos, cortesias.
- Frontend em português com dark mode, fluxo cliente completo e dashboard admin.
- Testes de regressão (`backend/tests/test_core_flows.py`) — 4/4 verdes.

## Mocked / Deferred
- **Mercado Pago / PIX real**: pendente de credenciais — fluxo "Pagar no Salão" ativo (MOCK do PIX).
- **Upload S3**: usar URL de imagem por enquanto (MOCK do storage).

## Backlog priorizado
- **P1**: CRUD de horários (expediente + exceções) na UI admin.
- **P1**: Cadastro de barbeiros adicionais pelo admin.
- **P1**: Gráficos de faturamento (dia/semana/mês) no relatório.
- **P2**: Integração real Mercado Pago PIX (quando credenciais chegarem).
- **P2**: Upload S3 para fotos de produtos.
- **P2**: Notificações (WhatsApp/e-mail) 24h antes do agendamento.
- **P3**: App PWA installable.

## Credenciais demo
- Admin: admin@imperial.com / Imperial123!
- Barbeiro: barbeiro@imperial.com / Imperial123!
- Cliente: registrar via tela pública.
