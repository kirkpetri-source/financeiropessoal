# Chamados de suporte — plano de implementação

Desenho aprovado: [`../specs/2026-08-21-chamados-de-suporte-design.md`](../specs/2026-08-21-chamados-de-suporte-design.md) (revisão 3)
Data: 21/08/2026
Etapa 1 de 3 da Fase 4

## Como usar este plano

Tarefas em ordem. Cada uma tem **pronto quando** — critério objetivo, não
"achei que ficou bom". Nada da fase seguinte começa antes da anterior fechar.

Regras do projeto que valem em toda tarefa:

- Teste antes do código onde couber (TDD)
- `npm test` verde em `functions/` antes de qualquer push (regra 4). Base de
  partida: **997 testes**
- Nenhum teste toca Firestore de produção — dublê via `criarEscopo(dbFalso)`,
  nunca `vi.mock` de módulo (regra 2)
- Nenhuma query sem tenant (regra 3). As duas exceções desta etapa estão
  declaradas na spec e moram num arquivo só
- Feature nasce em homologação (regra 17). Todo script: `ALVO=staging`
- Trabalho na branch `feature/chamados-suporte`. **`main` é deploy de produção
  do frontend na hora**

Tarefas marcadas **[KIRK]** dependem dele (conta, cartão, DNS). Todo o resto sai
por CLI ou código — regra 8.

---

## Fase 0 — Ambiente, antes de qualquer código de feature

### 0.1 Branch

- `feature/chamados-suporte` a partir de `main`

**Pronto quando:** push na branch gera preview no Vercel e `revelacash.com.br`
está intocado.

### 0.2 Storage no projeto de HOMOLOGAÇÃO — BLOQUEANTE dos anexos

O bucket de `revelacash-staging` **não existe** (conferido). Sem ele, a Fase 3
não tem onde ser testada, e a regra 17 proíbe estrear em produção.

- Provisionar o bucket padrão do staging pela Firebase Management API
- Se a API recusar, é o raro caso de 1 clique no Console — **[KIRK]**, com o
  caminho exato escrito

**Pronto quando:** um script com `ALVO=staging` sobe e apaga um arquivo de teste
no bucket do staging.

### 0.3 `storage.rules` — o buraco que existe hoje

Ligar Storage sem publicar regra deixa o bucket aberto para qualquer usuário
autenticado, e todo cliente do RevelaCash é autenticado.

- `storage.rules` com `allow read, write: if false`
- Seção `storage` no `firebase.json`
- Deploy nos dois projetos

**Pronto quando:** um cliente logado, com o SDK do navegador, recebe
`permission-denied` ao tentar ler o bucket; e o Admin SDK continua lendo.

### 0.4 Conta no Resend e domínio de envio — **[KIRK]**

- Criar conta no Resend
- Verificar `revelacash.com.br`: colar SPF + DKIM no registro.br (o DNS não está
  na Vercel, então não sai por CLI)
- Me passar a chave

**Pronto quando:** o Resend mostra o domínio verificado.

### 0.5 Segredo e variáveis

- `RESEND_API_KEY` no Secret Manager dos dois projetos
- `SUPORTE_EMAIL_DESTINO`, `SUPORTE_EMAIL_REMETENTE`,
  `SUPORTE_WHATSAPP_HOUSEHOLD_ID` no `.env` dos dois projetos
- `RESEND_API_KEY` na lista `SEGREDOS` do `index.js`

**Pronto quando:** um script manda um e-mail de teste pelo staging e ele chega.

---

## Fase 1 — Fundação: isolamento e autorização

Nada de tela aqui. É a camada em que um erro vira vazamento entre famílias.

### 1.1 `escopo.js` — os dois métodos novos, teste primeiro

Decisão 2 do Kirk. Arquivo mais sensível do projeto.

- Teste antes: `criarEmTransacao` carimba `householdId` e recusa gravar sem ele
- Teste antes: `atualizarAtomico` recusa documento de outra família com a mesma
  resposta de "não encontrado" (não vaza existência)
- Teste antes: `atualizarAtomico` ignora `householdId` vindo no patch
- Teste antes: o patch aceita `arrayUnion` e `increment` sem que o dublê precise
  entender a sentinela
- Só então implementar os dois métodos
- `supportTickets` entra em `COLECOES_ESCOPADAS`

**Pronto quando:** os 16 testes de vazamento existentes continuam verdes e os
novos cobrem os dois métodos. Nenhuma rota usa os métodos ainda.

### 1.2 Dublê de banco aprende `.select()`

A fila, a varredura e a contagem de chamados abertos usam projeção. Sem isso o
teste não consegue nem montar o cenário.

**Pronto quando:** um teste com `.select('status')` devolve só o campo pedido no
dublê.

### 1.3 `operadores` e `apenasOperadorAtivo`

- Teste antes: sem registro em `operadores` → 403
- Teste antes: registro com `ativo: false` → 403
- Teste antes: operador ativo → passa, e `req.operador` vem preenchido
- Implementar `src/middlewares/operador.js`
- `apenasAdmin` **não muda**

**Pronto quando:** os três testes passam e `git diff src/middlewares/admin.js`
está vazio.

### 1.4 `tools/criar-login-operador.js` cria o registro

- Além do login no Firebase Auth, gravar `operadores/{uid}` com nome, papel e
  `ativo: true`
- Simulação continua sendo o padrão; `--confirmar` aplica

**Pronto quando:** rodado com `ALVO=staging --confirmar`, existe login e existe
`operadores/{uid}`.

---

## Fase 2 — O chamado, lado do cliente

### 2.1 Numeração atômica

- `counters/supportTickets` com `{ ultimo }`
- Incremento e criação do chamado na **mesma transação** — número consumido sem
  chamado é buraco inexplicável depois
- Teste de forma com dublê, **sabendo que ele não prova concorrência**; a prova
  real é a tarefa 9.3

**Pronto quando:** o teste de forma passa e a limitação está escrita no arquivo
de teste, não só na spec.

### 2.2 `chamadoService.js` — criar, listar, ler

- Só `escopoDe`, nunca `db` cru
- Criar: valida assunto, categoria, texto de até 5.000 caracteres
- Teto de **5 chamados abertos** por família, contado com `.select('status')`
- Listar: `.select()` sem `mensagens[]`
- Ler: documento inteiro, com as mensagens

**Pronto quando:** testes de isolamento (família B não lê nem cria em A) e o
teto de 5 passam.

### 2.3 Responder e mudar de estado

- Uma escrita atômica só: `arrayUnion` na mensagem, `increment` na contagem,
  status, `aguardandoOperadorDesde`, `naoLido*`, `ultimaMensagem*`,
  `statusAlteradoEm`
- Cliente responde → `EM_ANDAMENTO`, `aguardandoOperadorDesde` = agora
- Quem escreve **não** acende o próprio indicador
- Reabertura: dentro de 30 dias reabre o mesmo; fora, cria novo com
  `reaberturaDe`

**Pronto quando:** cliente e operador respondendo quase juntos preservam as duas
mensagens, `quantidadeMensagens` bate, e os dois casos de reabertura passam.

### 2.4 Rotas do cliente

- `src/routes/chamados.js`, montada em `/suporte`
- `authMiddleware` + `resolverHousehold`, e **só o dono** (`req.papel === 'owner'`)
- Leitura **nunca** atrás de `exigirAssinatura` (regra 6): quem não paga
  continua abrindo chamado — inclusive para falar de cobrança
- Schemas zod sem `.default()` (regra 10)

**Pronto quando:** teste com `householdId` forjado no corpo é ignorado — vale o
`req.householdId`.

---

## Fase 3 — Anexos

Depende da 0.2 e da 0.3.

### 3.1 `utils/tipoDeArquivo.js` — magic bytes

- PNG, JPEG e PDF pelos 8 primeiros bytes
- Sem dependência nova

**Pronto quando:** `.png` com conteúdo de PDF é recusado, e o inverso também.

### 3.2 Upload pela API

- `app.use('/suporte/anexos', express.json({ limit: '8mb' }))` **antes** do
  parser global — mesmo padrão de `/importacao`
- Base64 no corpo; 5 MB por arquivo, 5 por mensagem
- Caminho `chamados/{householdId}/{ticketId}/{nomeAleatorio}`, com o
  `householdId` vindo de `req.householdId`, **nunca** do corpo
- Nome original só nos metadados

**Pronto quando:** arquivo acima do teto, tipo falsificado e estouro de
quantidade são recusados, cada um com sua mensagem.

### 3.3 Falha parcial não corrompe a mensagem

- Sobe os arquivos **antes** de gravar a mensagem
- Grava só os que subiram; devolve a lista do que falhou

**Pronto quando:** com um upload forçado a falhar, a mensagem existe, os anexos
válidos estão nela, e nenhum metadado aponta para arquivo inexistente.

### 3.4 Leitura pela API — decisão 3 do Kirk

- `GET /suporte/chamados/:numero/anexos/:anexoId`
- Autentica → `escopoDe` → confere que o anexo é daquele chamado daquela família
  → lê pelo Admin SDK → devolve os bytes com `Content-Type` e
  `Content-Disposition`
- **Sem `getSignedUrl` em lugar nenhum**

**Pronto quando:** anexo de outra família e `anexoId` que não pertence ao chamado
devolvem a mesma resposta de "não encontrado".

---

## Fase 4 — Fila e atendimento

### 4.1 `chamadosPlataformaService.js` — o único lugar cross-tenant

- `db` cru, com o motivo escrito no topo do arquivo, espelhando
  `adminAuditService.js`
- Fila: `where` por status, **sem `orderBy`**, `.select()` sem `mensagens[]`,
  teto de 200, ordenação em memória por `aguardandoOperadorDesde`
- Devolve o total junto, para a tela avisar quando o teto for atingido

**Pronto quando:** o teste do teto passa e nenhuma query da fila pede índice
composto.

### 4.2 Atender: responder, encaminhar, resolver

- Operador responde → `AGUARDANDO_CLIENTE`, `aguardandoOperadorDesde` = `null`
- Encaminhar: só para operador **ativo**; grava `atribuidoA` e `atribuidoEm`
- Resolver: `motivoResolucao: 'OPERADOR'` e `resolvidoPor` = uid
- Toda ação grava em `adminAuditLog`

**Pronto quando:** operador inativo é recusado em atender e em receber
encaminhamento.

### 4.3 Rotas do operador — a ordem no `app.js` é requisito

```js
app.use('/plataforma/chamados', chamadosOperadorRoutes);  // apenasOperadorAtivo
app.use('/plataforma', adminRoutes);                      // apenasAdmin
```

Inverter as duas linhas faz todo atendente virar admin, em silêncio.

**Pronto quando:** um operador ATENDENTE (fora de `ADMIN_EMAILS`) atende chamado
e recebe **403** em `/plataforma/metricas`. Este é o teste que dá sentido à
coleção `operadores`.

---

## Fase 5 — Notificações

### 5.1 `emailService.js`

- Resend por REST, sem SDK novo
- Nunca lança: devolve `{ enviado, erro }`, como o `notificacaoOperadorService`

**Pronto quando:** com a chave inválida, a função devolve erro e não derruba
quem chamou.

### 5.2 `notificacaoChamadoService.js`

- Os quatro eventos da tabela da spec
- WhatsApp ao operador pelo canal da família dele (decisão 1), destino
  `ownerJid`, via `respostaWhatsapp.responder` — assinatura anti-loop de graça
- Sem `SUPORTE_WHATSAPP_HOUSEHOLD_ID`, o WhatsApp fica desligado e sobra o
  e-mail
- **Fora de qualquer transação**: persiste primeiro, notifica depois

**Pronto quando:** teste afirma que **o corpo efetivamente enviado** não contém
o texto da mensagem, nos dois canais. Não basta afirmar sobre a intenção.

### 5.3 `notificacoesNaoEntregues`

- Grava tipo, chamado, canal, destinatário, erro e quando
- Leitura para a tela: `where('resolvida','==',false)` **sem `orderBy`**,
  ordenada em memória
- Baixa manual pelo operador

**Pronto quando:** falha de e-mail não derruba a criação do chamado e deixa o
registro.

---

## Fase 6 — Rotina diária

### 6.1 Separar sem renomear

- `lgpdService.executarExclusoesPendentes()` recebe o corpo que hoje está inline
  no `index.js` (linhas 67-85), agora com try/catch por família
- `exports.executarExclusoes` **mantém o nome** — renomear cria agendada nova no
  Cloud Scheduler e deixa a antiga viva

**Pronto quando:** teste da nova função passa e o nome exportado é idêntico ao
de antes (`git diff` do `index.js` não toca o `exports.`).

### 6.2 Varredura dos 15 dias

- `where('status','==','AGUARDANDO_CLIENTE')` com `.select()`, teto de 500
- Corte de data em memória sobre `statusAlteradoEm`
- Vira `RESOLVIDO` com `motivoResolucao: 'INATIVIDADE_CLIENTE'` e
  `resolvidoPor: 'SISTEMA'`
- Log avisa se o teto for atingido
- Os dois serviços na agendada com try/catch independente

**Pronto quando:** teste com relógio fixo resolve o de 15 dias e deixa o de 14
em paz; e uma exceção forçada num dos dois não impede o outro.

---

## Fase 7 — LGPD

### 7.1 Export inclui chamados

- Chamados com mensagens e **metadados** dos anexos (não os bytes)
- Aviso no cabeçalho: os anexos vêm pelo botão, não dentro do arquivo

**Pronto quando:** export de uma família com chamado traz tudo, e o de uma
família sem chamado continua idêntico ao de hoje.

### 7.2 Exclusão apaga chamados e arquivos

- `supportTickets` entra na lista de coleções varridas por `apagarHousehold`
- `bucket.deleteFiles({ prefix: 'chamados/{householdId}/' })`

**Pronto quando:** contra staging, apagar uma família descartável com anexo
deixa o prefixo vazio no Storage.

---

## Fase 8 — Frontend do cliente

Backend em produção **antes** — tela nova chamando rota que não existe quebra.

### 8.1 `/suporte` e `/suporte/:numero`

- Lista com status e ponto de não lido
- Formulário: assunto, categoria, descrição, anexos
- Conversa com bolhas, anexos abrindo pelo endpoint autenticado
- **Campo de texto não fica `disabled` enquanto envia** — perde o foco e ele não
  volta (armadilha já paga no chat da Nina)

**Pronto quando:** rodando local contra homologação, o ciclo inteiro funciona na
tela, incluindo abrir um print anexado.

### 8.2 Sidebar e rotas

- Item **Suporte** no `Sidebar.jsx`
- Rotas no `App.jsx`, dentro do `PrivateRoute`

**Pronto quando:** sessão expirada em `/suporte/12` volta para `/suporte/12`
depois do login, não para o dashboard.

### 8.3 Baixar anexos no "Meus dados"

- Botão ao lado de "Exportar meus dados", baixando cada anexo pelo endpoint
  autenticado

**Pronto quando:** uma conta com dois anexos baixa os dois, abríveis.

---

## Fase 9 — Frontend do operador e verificação ponta a ponta

### 9.1 Aba Chamados

- `ChamadosTab.jsx` registrada em `AdminPage.jsx`, ao lado das três atuais
- Fila ordenada por espera, filtro por status, aviso do teto de 200
- Responder, encaminhar, resolver
- Faixa de notificação não entregue, com baixa manual

**Pronto quando:** operador atende de ponta a ponta pela tela, contra
homologação.

### 9.2 `tools/testar-chamados-ponta-a-ponta.js`

`ALVO=staging` obrigatório, recusa rodar em produção, família descartável.

- Abrir, responder como suporte, conferir não lido dos dois lados, encaminhar,
  resolver, reabrir dentro e fora da janela
- Isolamento com uma segunda família
- Upload e leitura de anexo de verdade
- Limpa o que criou

**Pronto quando:** roda verde do zero duas vezes seguidas.

### 9.3 Prova da numeração atômica — a que o dublê não dá

- N criações disparadas em paralelo contra homologação
- Conferir N números distintos e o contador sem buraco

**Pronto quando:** 20 chamados simultâneos recebem 20 números distintos.

### 9.4 Landing

- Saída na seção `#duvidas`: "Não achou sua resposta? Abrir chamado"
- `npm run build` + navegador antes do push — **push em `main` é deploy**

**Pronto quando:** o link leva ao login e de lá ao painel.

---

## Checklist antes de cada deploy

1. `npm test` verde em `functions/`
2. `grep APP_CHECK_ENFORCE functions/.env.financeiropessoal-29b32` está `true`
   (regra 14)
3. `git ls-files | grep -iE 'serviceAccountKey|\.env$|backups/'` vazio
4. Backup do Firestore se algum script escreve (regra 1)
5. Mexeu em CORS/CSP: simular preflight `OPTIONS` **e** abrir o site em sessão
   anônima (regra 13)
6. `FUNCTIONS_DISCOVERY_TIMEOUT=30000` no Windows
7. Depois do deploy: `curl` confirmando que o App Check continua exigido

## Ordem de publicação

1. Homologação: backend e frontend local, ciclo inteiro verificado
2. **Kirk aprova** (regra 17)
3. Produção: backend primeiro (`firebase deploy --only functions:api`)
4. Produção: frontend depois (`git push origin main`)

## O que fica pronto para o Kirk decidir

- Quando criar o segundo operador (a etapa 2 traz a tela; até lá é o script)
- Se o aviso por WhatsApp fica ligado desde o primeiro dia ou só o e-mail
- Se a etapa 2 (papéis) começa em seguida ou se a central de ajuda passa na
  frente
