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
| IA | Gemini via REST, secret `GEMINI_API_KEY` — modelo atual `gemini-3.6-flash` (ver armadilha sobre descontinuação de modelo) |
| Canal | Evolution API (VPS Hostinger) hoje; Cloud API oficial preparada |
| Cobrança | Mercado Pago (preapproval mensal), secrets `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` |

O `README.md` descreve uma stack antiga (PostgreSQL + Prisma + JWT) que **não
existe mais**. A pasta `backend/` é legado morto, ignorada no git. O código em
`functions/` é a verdade.

## Comandos

```bash
cd functions
npm test                 # 280 testes (vitest)
npm run backup           # dump do Firestore em backups/ (fora do git)
npm run restore -- <arq> # simulação; --confirmar para valer
npm run seed              # só categorias e formas de pagamento padrão

# Ferramentas — todas carregam .env e segredos sozinhas
node tools/diagnostico-assinatura.js          # quem seria bloqueado hoje
node tools/testar-credencial-mp.js            # valida token do MP, sem imprimir
node tools/testar-assinatura-ponta-a-ponta.js <id>   # cria e sincroniza
node tools/testar-canal-ponta-a-ponta.js <id> --manter
node tools/marcar-conta-interna.js <id> --confirmar  # cortesia vitalícia
node tools/apagar-familia.js <id> --confirmar        # limpa conta de teste
node tools/criar-login-operador.js --confirmar       # cria/reseta a senha do painel gestor (/plataforma)

# Deploy da function inteira (todas de uma vez) ou só a API (mais rápido,
# cobre a maioria das mudanças — as agendadas raramente mudam):
firebase deploy --only functions --project financeiropessoal-29b32
firebase deploy --only functions:api --project financeiropessoal-29b32
cd .. && vercel deploy --prod --yes    # frontend (raramente necessário — git push já deploya, ver abaixo)
```

Vercel CLI já está instalado e autenticado nesta máquina (conta
`kirkpetri-4300`, time `lion-techs-projects-a92f3d16`) — `vercel domains
add/inspect/verify`, `vercel whoami` etc. funcionam direto, mesmo que um hook
de sessão diga "CLI não instalada".

## Git — push liberado

Repositório: `github.com/kirkpetri-source/financeiropessoal` (branch `main`).

O Kirk autorizou o push em 06/08/2026. **Commite e faça push ao fim de cada
bloco de trabalho concluído e testado** — não deixe dezenas de commits parados
na máquina como aconteceu na primeira sessão.

**`git push` para `main` publica o frontend em produção na hora** — o Vercel
tem integração automática com este repo (descoberto em 07/08/2026: um push
disparou deploy de produção sem nenhum comando de deploy explícito). Isso
significa que "commitar e testar antes de fazer deploy" não é uma sequência
segura por si só — testar local e depois dar push já É o deploy. Antes de
push com mudança grande de UI, testar via `npm run build` + navegador
(skill `run` ou `agent-browser`) como se já fosse produção, porque vai ser.
O backend (`functions/`) não segue essa regra — só vai ao ar com
`firebase deploy`, que continua manual.

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
   declarada é `routes/admin.js` (montada em `/plataforma`), que olha todas as
   famílias — por isso vive atrás de `apenasAdmin` e em rota separada, visível
   na revisão. Mesma exceção para `adminAuditLog` (log cross-tenant das ações
   do painel).
4. **Só faz push com a suíte verde.** `npm test` em `functions/` antes.
5. **Sem emoji nas respostas ao Kirk.** Português direto, sem bajulação.
6. **Bloqueio de assinatura nunca esconde dado.** Quem não paga perde o direito
   de LANÇAR; continua lendo, consultando e exportando todo o histórico.
   `exigirAssinatura` só entra em rota de escrita. Segurar dado financeiro de
   família como refém é ruim de produto e frágil na LGPD.
7. **Quem promove uma assinatura para `active` é o provedor — com uma
   exceção deliberada e auditada.** O painel do CLIENTE e o cliente nunca
   escrevem esse status: só `sincronizarDoProvedor`, depois de consultar a
   API do Mercado Pago. Status desconhecido não muda nada. A exceção é o
   painel do OPERADOR (`assinaturaService.registrarPagamentoManual`, Pix fora
   do sistema, negociação): função separada, nunca fala com o Mercado Pago,
   marca `provider: 'manual'`, só acessível atrás de `apenasAdmin`, e toda
   chamada grava em `adminAuditLog` quem fez e por quê. Isto não é uma
   brecha — é a válvula de escape do operador, com rastro.
8. **Resolver por CLI/API, nunca mandar o Kirk clicar em painel.** Está escrito
   em `eu/preferencias.md` do vault dele e foi ignorado uma vez, custando uma
   tarde. Antes de pedir qualquer coisa: "eu consigo fazer isso por script?"
   Só sobra para ele o que exige a conta dele, o cartão dele, uma aprovação de
   deploy, ou presença física.
9. **O cliente nunca configura infraestrutura.** Instância, credencial, grupo e
   o liga/desliga do canal são do sistema. Se um campo desses aparecer num
   formulário de cliente, está errado. `whatsappConfigSchema` é `strict` e
   `whatsappConfigService` tem lista de campos protegidos — as duas barreiras
   existem porque um "Salvar" apagou o canal de um cliente em produção.
10. **Nada de `.default()` em schema de update.** O zod preenche o campo mesmo
    quando o corpo não o menciona, e o valor inventado sobrescreve o real.
11. **O painel gestor (`/plataforma`) tem login próprio, sem relação com
    conta de família.** Usuário/senha (não e-mail), criados com
    `tools/criar-login-operador.js` — traduzido para um e-mail interno
    (`@operador.revelacash.internal`, nunca uma caixa real) só porque o
    Firebase Auth exige formato de e-mail. `PlataformaPage.jsx` fica FORA do
    `PrivateRoute`/`AuthContext` da família de propósito — não pode voltar a
    "misturar" com o menu de nenhuma família (foi assim que nasceu: o Kirk
    via o painel dentro do próprio Sidebar da conta dele). Limitação aceita:
    Firebase Auth mantém uma sessão só por navegador, então logar no portal
    troca a sessão ativa em qualquer aba do mesmo navegador.
12. **Consulta com `where` + `orderBy` em campos diferentes exige índice
    composto no Firestore** (`firestore.indexes.json`), e o dublê de banco
    dos testes automatizados NÃO reproduz essa exigência — passa limpo local
    e quebra em produção com `FAILED_PRECONDITION`. Foi assim que o
    drill-down do painel gestor nasceu quebrado. Para coleção pequena por
    filtro (dezenas de documentos, não milhares), prefira `where` sozinho +
    ordenar em memória a criar mais um índice — `adminAuditService.js` é o
    exemplo.

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
- **A mensagem tem que COMEÇAR dizendo se é gasto ou recebimento.**
  `detectType(words[0])` decide o tipo pela primeira palavra; `mercado 84,90`
  não casa com regra nenhuma e cai na IA, que erra. Toda instrução ao cliente
  precisa ensinar isso — havia sete textos ensinando o caminho errado.
- **Baileys recusa pareamento em sessão que já emitiu QR.** A instância tem que
  nascer com `qrcode: false` para o código de 8 dígitos valer.
- **O painel do Mercado Pago confere a URL do webhook com GET** antes de salvar.
- **`POST /preapproval` responde 500 com `payer_email` em `@testuser.com`.**
- **Celular sem o 9 vira destino inexistente e o gasto fica sem dono.** Validar
  com `src/utils/telefoneBR.js` — DDD da lista, 9 obrigatório, 11 dígitos.
- **`git push` para `main` já é deploy de produção do frontend** (integração
  automática Vercel↔GitHub). Ver detalhe em "Git — push liberado".
- **`firebase deploy` trava em "Cannot determine backend specification.
  Timeout after 10000" no Windows.** Não é erro de código — o antivírus
  escaneando os módulos durante a descoberta do backend passa dos 10s
  padrão. Rodar com o timeout maior:
  `$env:FUNCTIONS_DISCOVERY_TIMEOUT=30000` antes do `firebase deploy`
  (PowerShell) ou `FUNCTIONS_DISCOVERY_TIMEOUT=30000 firebase deploy ...`
  (bash).
- **Modelo do Gemini muda de nome e é desligado sem aviso na aplicação.**
  `gemini-2.0-flash` (usado desde o início do projeto) foi desligado pelo
  Google em 01/06/2026 — quebrou o parser de texto por IA em silêncio por
  mais de dois meses (o parser por regras cobre a maioria dos casos, então
  não aparecia) até o áudio/foto novo expor o erro. Antes de assumir o nome
  do modelo pela memória, confira o catálogo atual
  (`https://ai.google.dev/gemini-api/docs/models`) — modelo em uso hoje:
  `gemini-3.6-flash`.
- **Erro 429 do Gemini pode ser cota (transitória) ou modelo morto
  (permanente) — o corpo da resposta some no log truncado.** `[MidiaParser]
  Gemini retornou 429: "You exceeded..."` parecia só cota; o problema de
  verdade era o modelo descontinuado. Ler a mensagem completa antes de
  concluir "é só esperar a cota resetar".
- **O tour guiado de primeiro uso força navegação pro `/dashboard` uns
  900ms depois de QUALQUER login, se o navegador nunca viu o flag no
  localStorage** — inclusive login que deveria ir para outro lugar (o
  painel gestor, por exemplo). Em aba anônima isso é sempre "nunca viu".
  `TourContext.jsx` só pode auto-iniciar partindo do `/dashboard`.
- **Depois de um redirect para `/login` (sessão expirada, rota privada sem
  estar logado), o formulário de login precisa voltar pra rota que a
  pessoa pediu, não sempre pro `/dashboard`.** `PrivateRoute` guarda a rota
  em `state={{ from: location }}`; `AuthForm` lê `location.state.from` no
  login (não no cadastro — conta nova não tem "de onde voltar" que faça
  sentido).

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
  .isCreditCard/.closingDay/.dueDay paymentMethods: só quando é cartão de crédito
budgets                             householdId + categoryId, limite mensal fixo
recurringBills                      householdId, dueDay, lastGeneratedMonth
creditCardInvoices                  householdId + paymentMethodId + referenceCycle,
                                    status aberta (calculada) | fechada | paga
whatsappConfigs/{householdId}       config do canal, uma por família
  .modo                             individual | grupo (escolhido antes do QR)
  .metodoConexao                    qr | codigo (muda como a instância nasce)
  .instanceName                     fam-<householdId>, criada pelo sistema
  .ownerJid                         número que leu o QR; trava a auto-conversa
  .groupId / .groupInviteUrl        grupo criado automaticamente
deletionAudit                       prova de exclusão, sem dado pessoal dentro
adminAuditLog                       cross-tenant: ação do painel gestor, quem fez,
                                    em qual família, quando (sem orderBy — índice)
```

Membro que só usa o WhatsApp tem id `wa-<telefone>` e **não precisa de login**:
o telefone é a chave de atribuição. Login só serve para abrir o painel.

O painel GESTOR (`/plataforma`) é outra coisa: login próprio
(`kirkdouglas_19`, ver regra 11), sem household, sem relação com nenhuma
família — não confundir com o login de membro acima.

## Estado (08/08/2026)

Fases 0 a 5.1 e a Fase 4 inteira (orçamento, contas recorrentes, fatura de
cartão, áudio/foto por IA) no ar e verificadas em produção. Cobrança já em
credencial de **produção**. Painel gestor separado em `/plataforma`, login
próprio, todos os botões testados um a um contra família descartável.

Próximo passo em aberto, o Kirk decide:
1. Ampliar o parser (`Lanche 38,00 crédito` cai na IA por decisão consciente)
2. Convite de membro com login próprio (hoje um segundo login vira outra família)
3. Tutorial de primeiro uso (ele pediu pra deixar por último)
4. Testar áudio/foto com mensagem real de WhatsApp (nunca exercitado contra
   o servidor Evolution de verdade)

O detalhe de tudo — sessão por sessão, o que foi verificado, o que não foi, e
as armadilhas que já custaram horas — está em **`ESTADO.md`**.
