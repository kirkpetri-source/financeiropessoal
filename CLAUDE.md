# Financeiro Familiar — contexto do projeto

Sistema de controle financeiro familiar com lançamento por WhatsApp, em
transformação de uso pessoal para micro-SaaS a **R$ 24,90/mês**.

Origem: sistema que o Kirk e a Raquel usam há meses. **Os dados deles são reais
e não podem ser perdidos.** Eles são a família #1 e o primeiro teste de tudo.

## Stack real

| Camada | O que é |
|---|---|
| Frontend | React 18 + Vite + Tailwind + Recharts → Vercel (projeto `financeiropessoal`) |
| Backend | Express dentro de Cloud Functions v2, região `southamerica-east1` |
| Banco | Firestore (projeto `financeiropessoal-29b32`) |
| Auth | Firebase Auth (ID token no header, verificado pelo Admin SDK) |
| IA | Gemini 2.0 Flash via REST, secret `GEMINI_API_KEY` |
| Canal | Evolution API (VPS Hostinger) hoje; Cloud API oficial preparada |
| Cobrança | Mercado Pago (preapproval mensal), secrets `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` |

O `README.md` descreve uma stack antiga (PostgreSQL + Prisma + JWT) que **não
existe mais**. A pasta `backend/` é legado morto, ignorada no git. O código em
`functions/` é a verdade.

## Comandos

```bash
cd functions
npm test                 # 171 testes (vitest)
npm run backup           # dump do Firestore em backups/ (fora do git)
npm run restore -- <arq> # simulação; --confirmar para valer
npm run seed             # só categorias e formas de pagamento padrão

firebase deploy --only functions --project financeiropessoal-29b32
cd .. && vercel deploy --prod --yes    # frontend
```

## Git — push liberado

Repositório: `github.com/kirkpetri-source/financeiropessoal` (branch `main`).

O Kirk autorizou o push em 06/08/2026. **Commite e faça push ao fim de cada
bloco de trabalho concluído e testado** — não deixe dezenas de commits parados
na máquina como aconteceu na primeira sessão.

Antes de qualquer push, conferir que nada sensível está rastreado:

```bash
git ls-files | grep -iE 'serviceAccountKey|\.env$|backups/' || echo ok
```

Estão no `.gitignore` e precisam continuar assim: `functions/serviceAccountKey.json`,
`.env*`, `backups/` (contêm dados financeiros reais), `.vercel`.

## Regras que não se quebram

1. **Backup antes de qualquer script que escreva no Firestore.** Já salvou o
   projeto uma vez: a URL da Evolution foi sobrescrita e a original só existia
   no backup.
2. **Nenhum teste toca o Firestore de produção.** `firebaseAdmin.js` lança erro
   se for carregado sob `VITEST` sem emulador. Essa trava existe porque um
   `vi.mock` que não pegou fez a suíte escrever 4 documentos falsos em produção.
   Para testar, injete um dublê (`criarEscopo(dbFalso)`), nunca mock de módulo.
3. **Nenhuma query sem tenant.** Coleção de família só se acessa por
   `escopoDe(householdId)` (`src/data/escopo.js`). Usar `db` cru nos services é
   contornar a proteção. 16 testes cobrem os cenários de vazamento. A exceção
   declarada é `routes/admin.js`, que olha todas as famílias — por isso vive
   atrás de `apenasAdmin` e em rota separada, visível na revisão.
4. **Só faz push com a suíte verde.** `npm test` em `functions/` antes.
5. **Sem emoji nas respostas ao Kirk.** Português direto, sem bajulação.
6. **Bloqueio de assinatura nunca esconde dado.** Quem não paga perde o direito
   de LANÇAR; continua lendo, consultando e exportando todo o histórico.
   `exigirAssinatura` só entra em rota de escrita. Segurar dado financeiro de
   família como refém é ruim de produto e frágil na LGPD.
7. **Quem promove uma assinatura para `active` é o provedor.** O painel e o
   cliente nunca escrevem esse status: só `sincronizarDoProvedor`, depois de
   consultar a API do Mercado Pago. Status desconhecido não muda nada.

## Armadilhas já pagas (não repetir)

- **Cloud Run congela a CPU quando a resposta HTTP sai.** O webhook precisa
  processar ANTES de responder. A versão que respondia 200 na primeira linha
  perdia o trabalho no meio, sem deixar erro no log.
- **Dependência circular quebra em silêncio.** O Node só emite warning e a
  função importada vira `undefined`. Há um teste que detecta ciclos
  (`src/__testes__/dependencias.test.mjs`).
- **O bot roda no mesmo número do usuário.** Toda resposta enviada volta pelo
  webhook. Sem a assinatura invisível de `respostaTexto.js`, vira loop infinito.
- **Casamento por substring.** Keyword `net` casava em `netflix`, `posto` em
  `impostos`. Use `contemPalavra()` do parser, não `includes`.
- **`parseFloat('10x')` devolve 10.** Por isso `parseBrazilianAmount` recusa
  número com letra colada.

## Modelo de dados

```
households/{id}                     família = unidade de cobrança e isolamento
  .subscription                     status, trialEndsAt, currentPeriodEnd,
                                    provider, externalId, priceCents
  .deletion                         pedido de exclusão LGPD (congela a conta)
households/{id}/members/{userId}    papéis: owner | member | viewer
households/{id}/billingEvents/{id}  id do provedor como id do doc = idempotência
users/{uid}.householdId             atalho da família ativa (NÃO é autorização —
                                    quem manda é o doc em members/)
transactions, whatsappLogs          têm householdId, sempre escopadas
categories, paymentMethods          mistas: isDefault=true são globais
whatsappConfigs/{householdId}       config do canal, uma por família
deletionAudit                       prova de exclusão, sem dado pessoal dentro
```

## Estado (06/08/2026)

Fases 0 a 3 e 4.1 concluídas e verificadas em produção. **Fase 5 (cobrança,
LGPD e painel de operação) está pronta em código e ainda não foi deployada** —
depende de configurar a conta do Mercado Pago. A lista exata do que falta
configurar, e o detalhe das decisões, está em **`ESTADO.md`**.

Próximo passo em aberto: colocar a Fase 5 no ar (secrets + webhook do Mercado
Pago + teste ponta a ponta com credencial de teste), ou fechar a Fase 4
(orçamento, contas recorrentes, fatura de cartão). O Kirk decide.
