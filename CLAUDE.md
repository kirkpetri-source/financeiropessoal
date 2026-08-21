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
npm test                 # 981 testes (vitest)
npm run backup           # dump do Firestore em backups/ (fora do git)
npm run restore -- <arq> # simulação; --confirmar para valer
npm run seed              # só categorias e formas de pagamento padrão

# Ferramentas — todas carregam .env e segredos sozinhas
node tools/diagnostico-assinatura.js          # quem seria bloqueado hoje
node tools/testar-credencial-mp.js            # valida token do MP, sem imprimir
node tools/testar-assinatura-ponta-a-ponta.js <id>   # cria e sincroniza
node tools/testar-canal-ponta-a-ponta.js <id> --manter
node tools/testar-subcategoria-ponta-a-ponta.js      # CRUD + lançamento com subcategoria, família descartável
node tools/testar-importacao-ponta-a-ponta.js        # extrato: janela retroativa + trava de duplicidade, família descartável
node tools/testar-notificacao-cadastro.js            # simula o aviso de cadastro novo; --enviar manda de verdade

# Assistente de IA (Nina) — todos exigem ALVO=staging, recusam rodar em producao
ALVO=staging node tools/testar-consultor-ponta-a-ponta.js   # conversa real com o Gemini, familia descartavel
ALVO=staging node tools/testar-roteador-whatsapp.js         # prova que lancamento nao regride
ALVO=staging node tools/criar-conta-de-teste-staging.js     # conta completa p/ testar a tela; --apagar limpa
STAGING_WEB_API_KEY=<chave> ALVO=staging node tools/testar-rota-assistente.js  # rota HTTP com login real
ALVO=staging node tools/testar-webhook-ponta-a-ponta.js     # webhook inteiro: payload cru -> Firestore
ALVO=staging node tools/medir-custo-assistente.js           # custo real por pergunta, em reais
node tools/diagnostico-duplicidade-whatsapp.js [householdId]  # SO LEITURA: mensagem que virou 2 logs
node tools/diagnostico-conta-sem-familia.js           # login que nao abre o painel
node tools/acompanhar-whatsapp.js <id>                # assiste ao teste ao vivo, so leitura
node tools/zerar-limite-do-dia.js <id> --confirmar    # destrava teste que bateu a cota
ALVO=staging node tools/testar-consulta-direta.js         # camada sem IA (21)
ALVO=staging node tools/testar-audio-assistente.js        # audio pergunta, nao so lanca (14)
ALVO=staging node tools/testar-criar-subcategoria.js      # ciclo de criacao sob demanda (17)
ALVO=staging node tools/testar-lancamento-subcategoria.js # lancar direto na subcategoria (9)
ALVO=staging node tools/medir-composicao-do-prompt.js     # de que e feito o prompt, token a token
ALVO=staging node tools/testar-conta-fixa-assistente.js   # a Nina cadastra conta fixa (15)

# Painel local: SEMPRE contra homologacao. Producao recusa localhost duas
# vezes — CORS (lista fixa de origens) e App Check (reCAPTCHA so valida em
# revelacash.com.br). Preview da Vercel falha pelos mesmos dois motivos.
cd frontend && npm run dev -- --mode staging --port 5173 --strictPort
#   conta de teste: teste@revelacash.invalid / teste-da-nina-123
#   (criada por tools/criar-conta-de-teste-staging.js)
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

## Dois ambientes: homologação e produção

Desde 18/08/2026 existem **dois projetos Firebase**, e uma pasta só no disco.
O código é o mesmo; o que muda é para onde ele aponta.

| | Homologação (staging) | Produção |
|---|---|---|
| Projeto Firebase | `revelacash-staging` | `financeiropessoal-29b32` |
| Quem usa | ninguém — banco de teste | **13 famílias reais, pagantes** |
| Firestore | `southamerica-east1`, vazio | `southamerica-east1`, 357 lançamentos |
| API | `southamerica-east1-revelacash-staging.cloudfunctions.net/api` | a de sempre |
| App Check | **desligado, permanente** | `true`, sempre |
| Mercado Pago / Evolution | secrets de descarte, nada real | credenciais de produção |

### Vocabulário (pedido do Kirk em 18/08/2026)

Quando ele disser **"sobe para homologação"**, é o ambiente de teste. Quando
disser **"sobe para produção"** (ou "sobe pro ar", "publica"), é o real, com
clientes. Na dúvida entre os dois, **perguntar** — nunca presumir produção.

```bash
# BACKEND
firebase deploy --only functions --project staging   # homologação
firebase deploy --only functions --project prod      # produção (= --project default)

# SCRIPTS de tools/ e o seed — produção é o PADRÃO, staging exige pedir
ALVO=staging node tools/algum-script.js              # bash
$env:ALVO="staging"; node tools/algum-script.js      # PowerShell
node tools/algum-script.js                           # produção

# FRONTEND
git push origin feature/<algo>   # homologação: Vercel gera preview automático
git push origin main             # PRODUÇÃO NA HORA (ver seção abaixo)
```

**Todo script que fala com o Firestore anuncia em qual banco vai mexer**, na
primeira linha, com o `project_id` lido da credencial de verdade:

```
  [STAGING — ambiente de teste] revelacash-staging
  [PRODUÇÃO — DADOS REAIS DE CLIENTES] financeiropessoal-29b32
```

O anúncio mora em `src/config/firebaseAdmin.js` e não em
`tools/carregarAmbiente.js` porque nem todo script passa pelo carregador
(`src/seed.js` não passa) — mas todos passam pelo `firebaseAdmin`.

### Arquivos locais que o staging precisa (fora do git)

- `functions/serviceAccountKey.staging.json` — credencial do staging. **A falta
  dela com `ALVO=staging` é erro fatal**, nunca um fallback silencioso para
  produção. Gerada em Console → Configurações → Contas de serviço
- `functions/.env.revelacash-staging` — config do staging, com
  `APP_CHECK_ENFORCE=false` **permanente**

Esse `APP_CHECK_ENFORCE=false` separado **encerra a armadilha da regra 14**:
não é mais preciso editar o `.env` de produção para testar local e lembrar de
reverter. Foi assim que o App Check ficou desligado em produção por alguns
minutos em 11/08/2026. O arquivo de produção não precisa mais ser tocado.

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
13. **Mudança em CORS/CSP nunca é "testada" só com `curl`.** `curl` não faz o
    preflight `OPTIONS` que o navegador dispara sozinho antes de mandar um
    header novo — um `allowedHeaders` desatualizado passa limpo em qualquer
    teste de terminal e quebra 100% dos logins reais. Depois de mexer em
    `app.js` (CORS) ou `vercel.json` (CSP), simular o preflight de verdade
    (`curl -X OPTIONS ... -H "Access-Control-Request-Headers: ..."`) e abrir
    o site real no navegador (`agent-browser`, sessão nova) antes de dar por
    resolvido — foi assim que o rollout do App Check em 10/08/2026 quebrou o
    login em produção duas vezes seguidas antes de alguém notar.
14. **Antes de qualquer `firebase deploy` de functions, conferir
    `grep APP_CHECK_ENFORCE functions/.env.financeiropessoal-29b32` está
    `true`.** Esse arquivo é o mesmo lido pelo emulador local E empacotado
    no deploy real — editar pra `false` pra testar local (necessário, ver
    armadilha abaixo) e esquecer de reverter antes de deployar desliga o
    App Check em PRODUÇÃO. Aconteceu de verdade em 11/08/2026: alguns
    minutos com a exigência desligada, corrigido assim que percebido, sem
    dano (log de acesso conferido, só tráfego do próprio dono da conta).
    Depois de reverter, confirmar com `curl` na API de produção que voltou
    a pedir "Verificação do aplicativo ausente." antes de seguir.
15. **Importação de extrato só aceita mês JÁ FECHADO, e a trava de
    duplicidade mora no Firestore, não no código.** As duas coisas juntas
    são o contrato da feature (pedido explícito do Kirk em 16/08/2026):
    o mês corrente é onde os lançamentos por WhatsApp estão entrando, então
    ele nem é oferecido (`importacao/janela.js`, fuso fixo
    `America/Sao_Paulo` — o Cloud Run roda em UTC e abriria o mês três horas
    cedo); e o lançamento importado tem como ID a impressão digital da linha
    do banco, gravado com `escopo.criarComId` (`create()`, que o Firestore
    recusa se o ID existir). Conferência em código teria janela de corrida
    entre o "já existe?" e o "grava" — `create()` não tem. Qualquer mudança
    aqui precisa manter as duas barreiras; a terceira (casar valor+data
    contra o que já existe) é só sugestão de tela, nunca trava.
16. **Recurso caro de operar exige assinatura PAGA, não trial**
    (`exigirAssinaturaPaga`, hoje só a importação de extrato). E o corpo da
    recusa para quem está em trial válido é **403 `RECURSO_DE_ASSINANTE`**,
    nunca 402: o frontend trata 402 como "assinatura inativa" e dispara o
    alerta global (`EVENTO_ASSINATURA_INATIVA` em `services/api.js`) — quem
    está com o teste em dia veria alarme falso.
17. **Feature nova nasce em homologação, nunca direto em produção.** Existe
    ambiente de teste desde 18/08/2026 (ver seção "Dois ambientes") — o
    argumento de "é aditivo, não quebra nada" deixou de justificar estrear
    código em cima de 13 famílias pagantes. Fluxo: branch → homologação →
    Kirk aprova → produção. E **"homologação" e "produção" são palavras
    dele**: quando ele disser um dos dois, é esse ambiente, sem interpretar.
    Na dúvida, perguntar — nunca presumir produção.

18. **A assistente de IA (Nina) está liberada SÓ para a família de teste.**
    `ASSISTENTE_FAMILIAS` no `.env` de produção lista quem a enxerga — hoje só
    `bgo6KJKTgCqC1HN2Jqzh` (Família Vinicius, conta de teste do Kirk). Todas as
    outras 12 famílias seguem com o sistema exatamente como antes. Esvaziar a
    variável libera para todos; `ASSISTENTE_ATIVA=false` desliga tudo sem
    deploy e vence a lista. Com lista configurada, chamada SEM householdId
    fica de fora — liberar por omissão seria o erro mais caro aqui.

    **PARA LIBERAR PARA TODOS basta esvaziar a variável e deployar o BACKEND.**
    O menu "Assistente" do painel aparece sozinho: o frontend pergunta ao
    servidor (`GET /assistente/uso` → `{ativa}`) e obedece, via
    `AssistenteContext.jsx`. Não é preciso publicar o site de novo, e a lista
    de quem tem acesso nunca chega ao navegador.

19. **Consulta responde SEM IA, e o número vem do banco.** `roteadorDeConsulta`
    classifica a pergunta e `consultaDiretaService` executa, chamando as mesmas
    agregações que a IA chamaria. A regra de ouro é devolver `null` na dúvida —
    `null` manda para a IA, que é o comportamento antigo e portanto nunca é
    regressão. Conselho, aritmética e recorte que as agregações não fazem vão
    sempre para a IA. Consulta **não consome cota**: o teto existe para conter
    gasto de IA, e aqui não há gasto.

20. **Total exibido vem da AGREGAÇÃO, nunca da soma da lista mostrada.** Já
    errou duas vezes: a listagem somava os 12 itens exibidos e respondia
    R$ 903,17 onde o mês tinha R$ 1.369,31; e o comparativo descartava o mês
    base, comparando julho com agosto quando pediram junho. Os dois entregaram
    número errado com cara de exato, que é o pior resultado possível aqui.

21. **A camada sem IA só responde o que reconhece por INTEIRO.** O resumo
    devolve o total da família LOGADA, então qualquer palavra estranha na
    frase — nome de pessoa, de outra família, assunto novo — manda a pergunta
    para a IA (`temPalavraEstranha`). A defesa é por lista do que é ACEITO, e
    não do que é proibido: foi assim que "e quanto a família do Vinicius
    gastou?" deixou de responder os números da casa. Bloquear caso a caso
    depende de alguém ter previsto o caso; aceitar caso a caso, não.

22. **Feature que existe nos dois canais precisa ser testada nos DOIS — e no
    WhatsApp isso inclui TEXTO e ÁUDIO.** O cadastro de conta fixa funcionava
    no painel e, no WhatsApp, virava lançamento sempre que faltava o nome da
    assistente — a mensagem caía no parser, que via o valor e criava a despesa.
    A ferramenta ser compartilhada não garante que o CAMINHO até ela seja.
    Testar pelo `processarMensagemRecebida` (ver
    `tools/testar-webhook-ponta-a-ponta.js`), não só pelo service.

    O áudio é um terceiro caminho, não uma variação do texto: ele entra em
    outro ramo do webhook e precisa das MESMAS defesas. Em 20/08/2026 um "Sim"
    falado, que devia confirmar uma exclusão já proposta, voltou «Não entendi
    "Sim". Comece dizendo se gastou ou recebeu» — no texto funcionava. O mesmo
    com "Bom dia". Ao mexer no roteamento de texto, conferir o bloco de mídia
    (`tools/testar-audio-assistente.js`).

23. **Log de mensagem recebida nasce ATÔMICO, e só por
    `logDeMensagem.criarLogUnico`.** O log é a marca de "esta mensagem já foi
    tratada" — é ele que impede o webhook e o polling de lançarem o mesmo gasto
    duas vezes. Perguntar `jaProcessada()` e gravar depois deixa uma janela: as
    duas entregas passam pela pergunta antes de qualquer uma gravar. O id do
    documento é `<householdId>__<messageId>` e a gravação usa `create()`, que o
    Firestore recusa quando o id existe — mesma trava da regra 15, mesmo motivo.
    `jaProcessada()` continua ANTES, mas só para evitar trabalho caro (IA,
    baixar mídia); quem garante é a gravação. `whatsappLogService.createLog`
    foi removido de propósito: um caminho curto sem trava é o que a próxima
    pessoa usaria sem perceber.

## Armadilhas já pagas (não repetir)

- **Preview da Vercel não fala com a API de produção, e nunca vai falar.**
  São duas barreiras independentes: o CORS tem lista fixa de origens (preview
  tem hash aleatório a cada deploy) e o App Check exige token de reCAPTCHA,
  que só valida em `revelacash.com.br`. Liberar só o CORS não resolve — o App
  Check recusa em seguida. Para testar painel, rodar local contra
  HOMOLOGAÇÃO, que tem `APP_CHECK_ENFORCE=false` permanente e `localhost:5173`
  em `ALLOWED_ORIGINS`. A porta importa: 5174 não está na lista.
- **Correção que arruma um lado e esquece o outro passa despercebida quando o
  caso comum acerta por coincidência.** O comparativo foi corrigido no roteador
  (passou a devolver `mesA` e `mesB`), mas o executor continuou repassando só
  `mesB`. Como o padrão da agregação para `mesA` é "mês anterior ao atual",
  "compare com o mês passado" acertava — e "compare com junho" comparava JULHO
  com agosto, em silêncio. Só apareceu quando o teste de unidade da camada foi
  escrito. Ao corrigir um fluxo, conferir a ponta que CONSOME, não só a que
  decide.
- **Registrar certo e informar errado é, para o usuário, a mesma coisa que
  errar.** O lançamento em subcategoria já funcionava (o banco provava:
  Mercado > Padaria), mas a confirmação dizia só "em Mercado". O teste conferia
  o BANCO e passava; quem lia o WhatsApp concluía que a correção não tinha
  funcionado. Teste de feature de mensagem precisa verificar a MENSAGEM.
- **Resposta que começa pelo número responde a pergunta errada.** "Quanto a
  família Kadu gastou?" devolvia o total da PRÓPRIA família sem ressalva. Não
  era vazamento — o isolamento técnico funcionou — mas quem lê conclui que está
  vendo dado alheio, e a confiança morre ali com o sistema correto. Pergunta
  sobre terceiro começa pela ressalva.
- **Frase com " em " no meio vira nome de subcategoria se ninguém limitar o
  tamanho.** "quanto gastei esse mês em mercado" casava no separador de
  "Pet em Casa" e viraria a subcategoria "Quanto Gastei Esse M". Resposta a
  pergunta curta precisa de teto de palavras.
- **"Palavra solta vira o nome" também transforma SAUDAÇÃO em subcategoria.**
  Mesmo bug da linha acima pelo outro lado: com a oferta aberta, um "bom dia"
  virava a subcategoria *Bom Dia* — e a pessoa ainda recebia "Criei...".
  Lançar de manhã, o sistema oferecer e a pessoa cumprimentar é a sequência
  mais comum do canal. A lista de conversa fiada agora é uma só
  (`utils/conversaFiada.js`), usada pelo roteador E pela oferta; duas cópias
  divergiriam. A ordem importa: "sim"/"não" estão nessa lista e precisam ser
  testados ANTES dela, porque ali eles são resposta. Achado pelo rastro de um
  `[Resposta]` a mais no teste ponta a ponta — o número de checagens passava,
  o efeito colateral só aparecia no log.
- **Resposta a uma PERGUNTA da assistente caía no parser e virava despesa.**
  "cadastra minha internet como conta fixa" → a Nina pede valor e dia → a
  pessoa responde "139,90 dia 10" → o parser via um valor e criou uma despesa
  de R$ 139,90 em Outros. A conta fixa nunca era cadastrada e ainda sobrava um
  lançamento fantasma. O sistema não tinha o conceito de "a assistente está
  esperando uma resposta": agora a sessão guarda `esperandoRespostaAte` (10
  min, gravado quando a resposta da IA contém "?") e o roteador tem a regra 5.
  Ela vem DEPOIS da regra de lançamento de propósito — com pergunta no ar,
  "gastei 45 no mercado" continua sendo lançamento, e o banco só é consultado
  quando o parser por regra não entendeu a mensagem.
- **Input `disabled` enquanto a resposta não chega PERDE O FOCO, e ele não
  volta.** No chat do painel, o campo tinha `disabled={pensando}`: a cada
  Enter o navegador tirava o foco e a pessoa precisava clicar no campo de novo
  para escrever a pergunta seguinte. Desabilitar durante o carregamento parece
  proteção, mas o envio já estava barrado por código. A regra: não desabilitar
  campo de texto em fluxo de conversa; se desabilitar, devolver o foco quando
  reabilitar.
- **Diagnóstico escrito numa sessão anterior pode estar errado — conferir
  contra o banco ANTES de aplicar a correção prescrita.** O `ESTADO.md`
  registrava que a duplicidade de mensagens vinha de corrida entre
  `jaProcessada()` e a gravação, e mandava corrigir com `criarComId`
  (regra 15). Os dados de produção diziam outra coisa: 12 de 12 duplicatas
  vinham do caminho de fallback do roteador, que abria um segundo log da
  mesma mensagem, e ZERO de corrida. A correção prescrita teria quebrado o
  fallback e deixado o bug de pé. As duas causas se distinguem no banco:
  o log do webhook tem `rawPayload`, o que a assistente abria não tinha.
  `tools/diagnostico-duplicidade-whatsapp.js` faz essa separação.
- **Nenhuma chamada de IA do projeto reportava consumo de tokens até
  19/08/2026** — então toda conta de custo era chute, inclusive a do
  desenho da assistente (R$ 0,03/pergunta). Medido: **R$ 0,0177**, e o peso
  está na ENTRADA (7.628 tokens médios contra 393 de saída), porque cada
  rodada reenvia conversa + catálogo de ferramentas + vocabulário. O
  raciocínio variou de 0 a 665 tokens conforme a pergunta, não os ~700
  fixos que se supunha. Para cortar custo de IA aqui, encolher o que vai na
  ENTRADA — mexer no teto de saída só quebra a resposta (ver armadilha do
  `maxOutputTokens`). `chatIAService` e `aiParserService` agora registram
  tokens e reais no log de toda chamada.
- **`firebase deploy` empacota TUDO que está em `functions/` se o
  `firebase.json` não tiver lista de `ignore`** — não existe exclusão
  automática de credencial. Até 19/08/2026 o `serviceAccountKey.json` (chave
  privada de PRODUÇÃO) subia dentro do container da function de HOMOLOGAÇÃO,
  e vice-versa. Inerte em execução (`firebaseAdmin` só lê o arquivo quando
  `NODE_ENV != production`, e em Cloud Functions é sempre `production`), mas
  é a chave do Firestore de 13 famílias pagantes parada num projeto de
  acesso mais frouxo. O `ignore` do `firebase.json` SUBSTITUI a lista padrão
  — ao mexer nele, manter `node_modules` e `.git` na lista. Conferir pelo
  tamanho do pacote na saída do deploy (caiu de 474,74 KB para 347,35 KB).
- **O anúncio de ambiente do `firebaseAdmin` grita "PRODUÇÃO — DADOS REAIS
  DE CLIENTES" durante um `firebase deploy` para HOMOLOGAÇÃO.** É a etapa
  local de descoberta do backend carregando os módulos sem `ALVO` definido;
  nada é escrito e a function deployada usa a credencial do próprio projeto
  (`admin.initializeApp()` sem argumento). Mas o aviso que existe para
  proteger está dando alarme falso justamente na hora do deploy — não
  aprender a ignorá-lo.
- **Webhook do WhatsApp não pode ter teste em vitest.** `evolutionWebhook`
  importa `whatsappLogService`, que importa `firebaseAdmin` no topo, e a
  trava da regra 2 derruba a suíte inteira. Foi essa lacuna que deixou as
  quatro falhas do teste ao vivo de 18/08 passarem por 810 testes verdes. O
  substituto é `tools/testar-webhook-ponta-a-ponta.js`, que roda o webhook
  de verdade contra homologação — o envio da resposta falha de propósito
  (URL da Evolution inválida em staging) e `responder()` engole a falha, de
  modo que tudo que importa no banco acontece igual.
- **Script em `tools/` apontava para PRODUÇÃO sempre, sem dizer.** Até
  18/08/2026 o projeto era constante fixa em `carregarAmbiente.js` e
  `firebaseAdmin.js` usava `serviceAccountKey.json` (credencial de produção)
  fora do ambiente de Functions. Enquanto só existia um projeto isso era
  óbvio; no minuto em que o staging passou a existir, virou armadilha —
  rodar um script achando que está no ambiente de brincar e escrever no banco
  de cliente pagante. Corrigido com `ALVO`, com erro fatal quando a
  credencial de staging falta, e com o anúncio do ambiente em toda execução.
  **Achado antes de causar dano**, ao conferir para onde o `seed` apontava.
- **Renomear arquivo no Windows dobra a extensão.** A chave de staging virou
  `serviceAccountKey.staging.json.json` porque o Explorer esconde extensões
  conhecidas. Ao pedir um arquivo com nome exato para o Kirk, conferir o nome
  real com `ls` antes de concluir que ele não fez.
- **`maxOutputTokens` do Gemini 3.x inclui os tokens de RACIOCÍNIO do modelo,
  não só o texto que a pessoa lê.** Medido em 18/08/2026: numa pergunta de
  conselho, teto 800 → 764 tokens pensando + 32 de resposta + `MAX_TOKENS`
  (frase cortada no meio); teto 3000 → 735 pensando + 121 de resposta + `STOP`.
  Baixar o teto para "economizar" come a RESPOSTA, nunca o pensamento — quem
  faz a resposta ser curta é a instrução do prompt. Não dá para desligar o
  raciocínio neste modelo (`thinkingBudget: 0` é recusado). E **conferir
  `finishReason`**: até esta data nenhuma chamada ao Gemini no projeto conferia,
  então resposta truncada chegava ao cliente como se fosse completa. Isso
  também dobra a conta de saída, que é o token mais caro — qualquer estimativa
  de custo de IA feita sem contar o pensamento está errada.
- **Lista fechada de palavras-chave falha em SILÊNCIO.** Já tinha cobrado o
  projeto uma vez (`CATEGORY_MAP` mandando estabelecimento real para "Outros")
  e cobrou de novo em 18/08/2026: o filtro que decidia se uma mensagem do
  WhatsApp era pergunta tinha uma lista de aberturas ("quanto", "quais",
  "como"). "Detalhe os gastos de moradia" não estava nela e a mensagem foi
  descartada sem virar log — a pessoa fala e nada acontece. Português tem
  jeitos demais de pedir a mesma coisa. **Inverter**: listar o que BARRA (oi,
  bom dia, obrigado, ok, kkk — curta e estável) e deixar o resto passar. O erro
  muda de lado e fica muito mais barato.
- **`looksLikeFinancialMessage` responde NÃO para toda pergunta.** Ele procura
  valor e palavra de gasto; "quanto gastei em mercado?" não tem valor. Qualquer
  coisa nova que dependa de mensagens que NÃO são lançamento não pode ficar
  atrás desse filtro.
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
  automática Vercel↔GitHub). Ver detalhe em "Git — push liberado". **O
  deploy demora alguns minutos para aparecer em `vercel ls`** — em
  16/08/2026 isso levou à conclusão errada de que a integração estava
  desligada e a um `vercel deploy --prod` manual desnecessário (os dois
  deploys entraram, sem prejuízo). Esperar e conferir de novo antes de
  deployar à mão.
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
- **Gemini transcreve valor falado "quatro e cinquenta" como dois números
  soltos ("4 e 50"), não como "4,50".** O parser por regra pega sempre o
  ÚLTIMO valor numérico da frase — um áudio de R$4,50 virava lançamento de
  R$50. Achado com mensagem real do Kirk. Corrigido no PROMPT do
  `midiaParserService.transcreverAudio`, instruindo a IA a já escrever o
  valor falado como número único com vírgula.
- **O parser por regra só extrai UM valor por mensagem.** "gastei 30 no
  mercado e 80 de gasolina" virava um único lançamento de R$80 em Mercado —
  pegava o último número e descartava o resto em silêncio. Corrigido:
  `financialParser.parseFinancialMessage` devolve `null` (cai pra IA, que já
  sabia separar vários lançamentos numa frase) sempre que a mensagem tem
  mais de um valor numérico plausível.
- **`CATEGORY_MAP` do parser é uma lista fechada de palavras-chave — nome de
  estabelecimento real fora da lista cai em "Outros" em silêncio.** Um cupom
  de churrascaria caiu em Outros porque "churrascaria" não estava mapeada
  pra Alimentação (só "restaurante", "pizza" etc. estavam). Vale revisar essa
  lista sempre que aparecer uma categorização estranha.
- **IntersectionObserver + screenshot de página inteira (`--full`) dá falso
  positivo de "seção em branco".** Testado um efeito de reveal-on-scroll e
  depois `loading="lazy"` em imagens — a captura de página inteira não
  dispara scroll de verdade, então o observer/lazy-load nunca ativa e a
  seção aparece vazia na screenshot mesmo funcionando perfeitamente pra um
  usuário rolando de verdade. Sempre confirmar rolando de fato
  (`agent-browser scroll` + screenshot por posição) antes de concluir que é
  bug.
- **Legenda de foto de marketing precisa ser conferida contra a cena real da
  imagem, não só contra a ideia da feature.** Uma foto de lançamento por
  áudio mostrava a pessoa parada num posto de gasolina, mas o texto dizia
  "até dirigindo, sem tirar as mãos do volante" — sugeria usar celular em
  movimento, o que a própria imagem não mostra e que seria um problema de
  segurança/legal se mostrasse. Corrigido pra descrever a cena de verdade
  (parada, abastecendo).
- **Firebase App Check não injeta o header sozinho numa API Express
  própria.** `getToken()`/anexar `X-Firebase-Appcheck` só acontece
  automaticamente em chamadas feitas por outros SDKs do Firebase (Firestore,
  Functions callable) — numa API REST própria (como `services/api.js` deste
  projeto) o interceptor precisa buscar o token e anexar à mão, do mesmo
  jeito que já faz com o `Authorization: Bearer`. Esquecer isso não dá erro
  nenhum até a exigência (`APP_CHECK_ENFORCE`) ser ligada no backend.
- **CORS: header novo no frontend (`X-Firebase-Appcheck`) precisa entrar em
  `allowedHeaders` no `app.js`, senão o preflight do navegador recusa a
  chamada inteira antes dela sair** — mesmo com a exigência desligada no
  backend, porque o frontend já manda o header sempre que `appCheckInstance`
  existe. Foi o que derrubou o login em produção por alguns minutos em
  10/08/2026; só apareceu no `curl` depois, nunca durante os testes com
  `curl` sem preflight simulado (ver regra 13).
- **CSP do reCAPTCHA v3 precisa de `www.google.com`/`www.gstatic.com` em
  `script-src` E TAMBÉM em `connect-src`** (e `www.google.com` em
  `frame-src`) — o script não só carrega de lá, ele troca dados com o Google
  o tempo inteiro enquanto funciona (`api2/reload`, `api2/clr`, `api2/bcn`).
  Faltar só o `connect-src` não dá erro nenhum na maioria das visitas (o
  navegador já tem cache/sessão), só aparece limpo em aba anônima/sessão
  nova — testar sempre em sessão sem cache antes de dar por resolvido.
- **Registrar reCAPTCHA v3 no Firebase Console → App Check pede a chave
  SECRETA do reCAPTCHA, não a site key.** Contraintuitivo: o site key (a
  pública, usada no frontend) é o que se manda pro `VITE_RECAPTCHA_SITE_KEY`
  e pro provider do SDK; mas o campo de registro do app no Console pede a
  outra chave (a que o backend do Firebase usa pra validar a pontuação
  direto com o Google). Confundir as duas dá erro `App not registered`
  mesmo com o app "registrado" na lista.
- **reCAPTCHA v3 pontua navegador automatizado/headless como bot — de
  propósito.** Testar o fluxo de App Check com `agent-browser` no modo
  padrão (headless) sempre falha com `App attestation failed`
  (`PERMISSION_DENIED`), mesmo com tudo configurado certo; é o reCAPTCHA
  funcionando como devia. Pra confirmar que a configuração está correta, usa
  `--headed` (navegador visível) — só assim a pontuação sai alta o
  suficiente pra passar, do mesmo jeito que passaria pra um usuário real.
- **Firebase CLI não tem comando pra App Check** (`firebase appcheck ...`
  não existe nesta versão) **nem pra gerar chave de reCAPTCHA** — os dois
  passos (criar a chave em `google.com/recaptcha/admin` e registrar o app em
  Firebase Console → App Check) são cliques manuais mesmo, sem caminho de
  CLI/API. É uma das poucas exceções genuínas à regra 8: exige a conta
  Google do Kirk, não tem script que substitua.
- **Apagar uma família com o WhatsApp desconectado deixa o número "meio
  vinculado" do lado do WhatsApp.** Desvincular um aparelho de verdade exige
  uma sessão ABERTA — é ela que manda o sinal de logout. Instância já em
  `close` na hora de apagar não tem canal pra mandar nada: os arquivos somem
  do nosso lado, mas o WhatsApp continua lembrando do aparelho até expirar
  sozinho (pode levar dias). Pareamento novo com o MESMO número falha nesse
  meio tempo com "não foi possível conectar ao dispositivo" — sem relação
  nenhuma com código expirado ou limite de dispositivos. Descoberto quando o
  Kirk apagou a `Família Vinicius` (conta de teste) pelo `/plataforma` e não
  conseguiu reconectar o mesmo número do zero. Resolve na hora removendo o
  aparelho antigo em WhatsApp → Aparelhos conectados, no celular do número
  afetado. `lgpdService.apagarFamiliaAgora` agora loga um aviso
  (`avisoWhatsapp`) quando a instância já estava desconectada — vale também
  para um CLIENTE de verdade que cancela e tenta assinar de novo com o mesmo
  WhatsApp depois.
- **O emulador de Functions local só existe com Node 22 pinado
  (`engines.node` do `package.json`); esta máquina só tem Node 24 global,
  e o emulador roda nele mesmo assim ("Using node@24 from host").** Isso
  quebra especificamente `admin.firestore.FieldValue` — toda escrita que
  passa por `dados.criar()`/`dados.atualizar()` (carimba `createdAt`/
  `updatedAt`) derruba com `TypeError: Cannot read properties of undefined
  (reading 'serverTimestamp')`. Um script `node tools/algo.js` direto, fora
  do emulador, não tem esse problema (mesma versão do Node, mas sem o
  wrapper do Functions Framework por perto) — foi assim que
  `testar-subcategoria-ponta-a-ponta.js` funcionou perfeitamente contra
  produção enquanto o mesmo POST pelo painel local (emulador) dava 500.
  Leitura (GET) funciona normal local; é só escrita que quebra. Produção de
  verdade roda Node 22 (confirmado no log do `firebase deploy`: "Node.js 22
  (2nd Gen)"), então isso NUNCA acontece lá — é limitação só deste
  ambiente local, não bug de código. Solução de verdade: instalar Node 22
  (nvm-windows) só pra rodar o emulador.
- **`APP_CHECK_ENFORCE=false` passado como variável de ambiente no shell
  (`APP_CHECK_ENFORCE=false firebase emulators:start ...`) NÃO tem efeito
  — o Firebase recarrega `.env.financeiropessoal-29b32` por cima e
  sobrescreve.** Pra testar local sem App Check (obrigatório: reCAPTCHA só
  valida em `revelacash.com.br`, nunca em `localhost`), o único jeito é
  editar o valor DENTRO do arquivo e reiniciar o emulador do zero (só
  editar não basta — precisa matar e subir de novo, o valor é lido na
  inicialização do processo). Reverter depois é regra 14 acima.
- **No modo individual do WhatsApp (mensagem pra si mesmo), o campo
  `senderJid` NUNCA vem preenchido.** `extrairMensagem()` só usa
  `remoteJid` quando `fromMe` é falso (`senderJid: data.key?.participant
  || (fromMe ? null : remoteJid) || null`), e no chat "Mensagens para mim"
  toda mensagem — inclusive as que a própria pessoa manda pra si — chega
  com `fromMe: true` (é a mesma trava documentada como "TRAVA DO MODO
  INDIVIDUAL" em `acharHouseholdPorOrigem`). Qualquer feature nova que
  precise saber "quem mandou" pra endereçar uma resposta (ex.: pra quem
  perguntar) quebra em silêncio nesse modo se depender só de `senderJid`
  — precisa de um fallback pro dono do canal
  (`whatsappConfigs.ownerJid`, `lancamentoPorMensagem.telefoneEfetivo`).
  Achado testando de verdade (11/08/2026, conta liontech.sup@gmail.com,
  modo individual): a pergunta de subcategoria confirmava o lançamento mas
  nunca perguntava nada — sem erro nenhum no log, só silêncio. Em modo
  grupo isso nunca acontece, `participant` sempre vem.

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
  .subcategoryId                    transactions: opcional, valida contra categoryId
  .digital/.importId                transactions: só nas importadas (origin: 'IMPORT').
                                    `digital` é a impressão da linha do banco e vira
                                    parte do ID do doc — é o que trava duplicata
importBatches                       householdId, um doc por importação de extrato:
                                    rascunho (linhas lidas) → confirmado → desfeito
importMemoria                       householdId como id do doc; mapa contraparte →
                                    categoria que a família ensinou importando
categories, paymentMethods          mistas: isDefault=true são globais
  .isCreditCard/.closingDay/.dueDay paymentMethods: só quando é cartão de crédito
subcategories                       householdId + categoryId, sempre da família
                                    (sem versão padrão/global, diferente de categories)
pendingSubcategoryConfirmations     householdId + phone, efêmera (single-shot, expira
                                    em 15min) — "IA perguntou a subcategoria, esperando
                                    resposta"; ver lancamentoPorMensagem.js
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

## Estado (16/08/2026)

**Importação de extrato bancário — no ar, front e back publicados.**
Cliente sobe o OFX/CSV que o banco exporta, confere na tela e importa em
lote. Só mês já fechado (regra 15). Duplicidade é impossível por
construção: o ID do lançamento importado é a impressão digital da linha do
banco. Dá para desfazer o lote inteiro. Exige assinatura paga (regra 16).
Verificado com script contra o Firestore real (17/17) e na tela em produção
com conta de teste descartável — incluindo reimportar o mesmo arquivo, que
não duplica nada. **Falta o Kirk testar com o extrato real do banco dele.**

**Aviso de cadastro novo no WhatsApp do operador.** Cada cadastro manda
nome + telefone para a auto-conversa do Kirk
(`notificacaoOperadorService.js`), pelo canal da própria família dele.
Desligado por padrão: só existe com `NOTIFICACAO_CADASTRO_HOUSEHOLD_ID` no
`.env`. Nunca derruba o cadastro se o WhatsApp falhar.

## Estado (11/08/2026)

**Subcategorias — no ar, em produção, front e back publicados.**
Categoria ganhou um nível: família pode criar subcategorias (ex.: dentro de
"Mercado" → Padaria, Açougue, Hortifruti). Opt-in de verdade — sem nenhuma
subcategoria cadastrada, nada muda pra ninguém (sem custo de IA extra, sem
pergunta no WhatsApp, sem campo a mais no formulário). Painel: gestão em
Categorias (expandir → criar/editar/apagar) + campo opcional no formulário
de lançamento. WhatsApp: comando manual `subcategoria <nome>` (espelha
`categoria <nome>`) e resolução automática pela IA — quando a categoria
resolvida já tem subcategoria cadastrada, tenta identificar pela descrição;
se confiante aplica direto e sem gerar mensagem; se incerta, pergunta
(numerada) e aplica na resposta seguinte. Testado ao vivo pelo WhatsApp com
conta de teste dedicada (nunca na família Kirk real) antes de publicar.
Guia em PDF pra mandar aos usuários em
`C:\Users\Predator\Documents\RevelaCash\guias-usuario\`.

Dois bugs achados testando de verdade, corrigidos e já em produção: modo
individual sem `senderJid` (pergunta nunca chegava) e mensagem do comando
manual sem numerar as opções apesar de dizer "responda com o número" — ver
"Armadilhas já pagas". Um incidente também aconteceu e foi corrigido na
hora: um deploy carregou `APP_CHECK_ENFORCE=false` (deixado assim pra
testar local) e desligou a exigência em produção por alguns minutos —
revertido, log de acesso conferido sem sinal de abuso. Ver regra 14.

## Estado (10/08/2026)

Fases 0 a 5.1 e a Fase 4 inteira no ar e verificadas em produção. Cobrança em
credencial de **produção**. Painel gestor separado em `/plataforma`, login
próprio. Domínio real em uso pelos clientes: **`revelacash.com.br`**.

**Auditoria de segurança completa + escalada** (sessão de 09-10/08/2026):
isolamento entre famílias corrigido num ponto real (categoria/forma de
pagamento de outra família aceitas sem checar posse), `/auth` validado,
CORS restrito, headers de segurança (CSP/HSTS) no `vercel.json`, teto diário
de IA por família (60/dia, `limiteIAService.js`), rate limit por família
além do global (40 msg/min, `limiteMensagensService.js`), `npm audit` (23 de
39 vulnerabilidades corrigidas sem quebra), CI no GitHub Actions, e
**Firebase App Check** ativo e exigido (`APP_CHECK_ENFORCE=true`) — depois
de um rollout com dois incidentes reais de produção (CORS e CSP faltando o
header/origem novos), ambos corrigidos e verificados em sessão anônima. Ver
as novas entradas em "Armadilhas já pagas" acima antes de mexer em App
Check/CORS/CSP de novo. Detalhe completo em **`ESTADO.md`**.

24 artes de Instagram (apresentação do produto + diferenciais familiares) em
`C:\Users\Predator\Documents\RevelaCash\instagram-lancamento`.

**EM ANDAMENTO (10/08/2026) — migração pro WhatsApp oficial (Cloud API).**
Verificação de negócio da Lion Tech já estava pronta (18/10/2025). WABA
`revelacash` (ID `1517576109683204`) e número dedicado `+55 64 9613-0798`
(Phone Number ID `1229153730286556`) criados e verificados; app
`revelacash` (App ID `1581075037136939`) criado em developers.facebook.com;
usuário do sistema `revelacash-api` criado e token de longa duração gerado
(`whatsapp_business_management` + `whatsapp_business_messaging`), salvo no
Secret Manager como `WHATSAPP_CLOUD_API_TOKEN` — testado com sucesso contra
a API real da Meta (chamada de leitura, `curl` direto). Falta: testar
`cloudApiProvider.js` (o código do adapter) contra a API real, e depois
esperar 30 dias corridos usando a Cloud API antes de pedir a Official
Business Account (gratuita — exigência da Meta, não do código; sem ela a
Groups API não libera, então o "modo grupo" do canal só funciona por Cloud
API depois disso). A Evolution API continua sendo o canal ativo dos
clientes reais até a migração de fato acontecer — nada foi trocado ainda.
Passo a passo completo e checkpoint atualizado em **`ESTADO.md`**, seção
"Caminho pro WhatsApp oficial (Cloud API / OBA)" — continuar exatamente
dali na próxima sessão.

Próximo passo em aberto, o Kirk decide:
0. **Kirk testar a importação com o extrato real do banco dele** — único
   teste que falta na feature de 16/08 (os sintéticos passaram todos)
1. Terminar a migração pro WhatsApp oficial (em andamento, ver acima;
   os 30 dias corridos contam desde 12/08/2026, então a OBA pode ser
   pedida a partir de ~11/09/2026)
2. Ampliar o parser (`Lanche 38,00 crédito` cai na IA por decisão consciente)
3. Convite de membro com login próprio (hoje um segundo login vira outra família)
4. Tutorial de primeiro uso (ele pediu pra deixar por último)

O detalhe de tudo — sessão por sessão, o que foi verificado, o que não foi, e
as armadilhas que já custaram horas — está em **`ESTADO.md`**.
