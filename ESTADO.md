# Estado do projeto — 06/08/2026

Transformação de sistema pessoal em micro-SaaS a R$ 24,90/mês.

## Decisões já tomadas (não reabrir sem motivo)

| Tema | Decisão | Por quê |
|---|---|---|
| Canal WhatsApp | **Adapter**: Evolution agora, Cloud API oficial depois | Lança rápido sem ficar preso; a Groups API oficial (aberta jun/2026) permite 8 participantes por grupo e 10.000 grupos por número, e o fluxo recebe→confirma custa R$ 0,00. Depende da OBA, que sai via Meta Verified (~R$ 69,90/mês) |
| Cobrança | **Mercado Pago** | Escolha do Kirk. Taxa pesa mais que as alternativas no ticket baixo, mas a marca reduz atrito na venda. Alternativas avaliadas: Asaas com Pix Automático (~1%), AbacatePay (R$ 0,80 Pix recorrente) |
| Dados do Kirk | Migrados no mesmo projeto Firebase | Zero perda, ele segue usando durante a obra e é o primeiro testador |

## Concluído e em produção

**Fase 0 — rede de proteção**
- `tools/backup.js` e `tools/restore.js`, restauração verificada em dry-run
- Vitest: 92 testes

**Fase 1 — segurança**
- Webhook autenticado por token na URL (era aberto: qualquer um injetava lançamento)
- Rate limit por rota (o pacote estava instalado e sem uso; o README mentia)
- Troca de senha reautentica pelo Firebase (o backend ignorava a senha atual)
- Seed não cria mais `admin@financeiro.local` / `admin123`
- Login do Kirk migrado para `kirkpetri@gmail.com`

**Fase 2 — multi-tenancy**
- `src/data/escopo.js`: acessor que só existe com `householdId`. 16 testes de isolamento
- `households` + membros em subcoleção + papéis owner/member/viewer
- Todos os services, webhook e polling migrados
- Migração aplicada: 113 lançamentos, 123 logs, config — nada perdido
- Frontend: seção "Minha Família", filtro por pessoa agora aplicado no backend

**Fase 3 — canal e interação**
- Adapter `src/canais/` (evolution + cloud-api)
- Confirmação no WhatsApp após lançar (o template existia e ninguém lia)
- Comandos: `resumo`, `ultimos`, `apagar ultimo`, `categorias`, `ajuda`
- `vincular CODIGO` liga o grupo à família sem digitar ID de grupo

**Fase 4.1 — parcelamento**
- `geladeira 1200 em 10x` vira 10 lançamentos de R$ 120, um por mês
- Centavos e datas tratados (21 testes)

## Falta

**Fase 4 (restante)**
- Orçamento por categoria com alerta de estouro
- Contas fixas recorrentes com lembrete
- Fatura de cartão de crédito (fechamento e vencimento)
- Áudio transcrito e foto de cupom (OCR) — ambos via Gemini

**Fase 5 — o que destrava a venda**
- Integração Mercado Pago (assinatura recorrente)
- Trial de 14 dias já modelado em `subscription.status = 'trialing'`;
  falta o bloqueio quando vence — usar `householdService.assinaturaAtiva()`
- Painel admin (MRR, churn, famílias ativas)
- LGPD: termos, política, exclusão de conta, exportar dados

**Fase 6 — landing page**
- Requisito do Kirk: **fotos de pessoas reais**, tema controle financeiro
- Detalhe técnico: página publicada bloqueia recurso externo — imagens
  precisam ir embutidas (data URI)

## Pendências operacionais do Kirk

- Aplicar para **Meta Verified** se quiser o canal oficial (2 a 8 semanas)
- Vault Obsidian desatualizado: `projetos/financeiro.md` e `sistema/painel.md`
  ainda marcam o projeto como "em-planejamento"

## Dívidas conhecidas

- `README.md` descreve stack que não existe mais (PostgreSQL/Prisma)
- Pasta `backend/` é legado morto
- Rate limit é em memória, portanto por instância — segura flood trivial,
  não ataque distribuído. App Check resolveria
- `cloudApiProvider.js` está escrito conforme a documentação mas **nunca foi
  exercitado contra a API real**. Tratar como não verificado
- Bundle do frontend em ~936 kB, sem code splitting
