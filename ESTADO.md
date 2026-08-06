# Estado do projeto — 06/08/2026 (Fase 5 concluída em código)

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

**Fase 5 — cobrança, LGPD e operação** (código pronto, **não deployado ainda**)

Assinatura
- `src/assinatura/estado.js` — regra pura: trial de 14 dias, carência de 5
  dias após o vencimento, bloqueio. O trial vale em paralelo ao status do
  provedor, então iniciar o checkout no meio do teste não encurta o teste
- `src/assinatura/mercadoPago.js` — preapproval mensal de R$ 24,90 (sem
  `preapproval_plan`, valor no corpo), cliente HTTP injetável, HMAC do webhook
  com janela de 10 min contra replay
- `assinaturaService` — só o provedor promove para `active`; evento de cobrança
  gravado com o id do provedor como id do documento, o que torna a reentrega
  do webhook idempotente
- Bloqueio em **toda escrita** (transactions, categories, paymentMethods) e no
  lançamento por WhatsApp. Leitura e exportação seguem liberadas

LGPD
- Exportar tudo em JSON (sem a chave da Evolution nem o código de vínculo)
- Excluir conta com 7 dias de arrependimento: congela na hora, job diário
  (`executarExclusoes`, 03:00 BRT) apaga depois do prazo
- `/termos` e `/privacidade` públicas, linkadas do login e do checkout

Operação
- `/admin/metricas` e `/admin/familias`; tela em `/admin` (sem link no menu)
- Acesso por custom claim `admin` ou `ADMIN_EMAILS`, com e-mail verificado
  obrigatório. Sem configuração, ninguém entra

Testes: 92 → 171.

## Pendências para a Fase 5 ir ao ar

Nada disso está feito ainda — é configuração de conta, não código:

1. Criar a aplicação no painel do Mercado Pago e pegar o access token de
   produção
2. `firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN`
3. `firebase functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET` (o mesmo valor
   que o painel do MP mostrar ao cadastrar o webhook)
4. Cadastrar a URL do webhook no painel do MP:
   `https://southamerica-east1-financeiropessoal-29b32.cloudfunctions.net/api/webhooks/mercadopago`
   marcando os eventos **subscription_preapproval** e
   **subscription_authorized_payment**
5. Variáveis de ambiente da function: `ADMIN_EMAILS=kirkpetri@gmail.com` e
   `APP_URL` (só se o domínio for diferente de `financeiropessoal.vercel.app` —
   é para onde o Mercado Pago devolve o cliente depois de pagar)
6. Testar ponta a ponta com credencial de **teste** antes de virar produção
7. Conferir se a família do Kirk tem `subscription.trialEndsAt` preenchido; se
   estiver vazio, ele mesmo se bloqueia no próximo deploy

Ponto não verificado: o `mercadoPago.js` foi escrito conforme a documentação e
os testes usam um `fetch` dublê. **Nenhuma chamada real à API do Mercado Pago
foi feita.** Tratar como não verificado até o teste do item 6, do mesmo jeito
que o `cloudApiProvider.js`.

## Falta

**Fase 4 (restante)**
- Orçamento por categoria com alerta de estouro
- Contas fixas recorrentes com lembrete
- Fatura de cartão de crédito (fechamento e vencimento)
- Áudio transcrito e foto de cupom (OCR) — ambos via Gemini

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
- `mercadoPago.js` está na mesma situação (ver "Pendências para a Fase 5 ir ao ar")
- Bundle do frontend em ~974 kB, sem code splitting
- `/admin/metricas` lê todos os households a cada chamada. Serve de sobra para
  dezenas ou centenas de famílias; passa a doer nos milhares
