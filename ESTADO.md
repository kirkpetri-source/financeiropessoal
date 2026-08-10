# Estado do projeto — 10/08/2026 (auditoria de segurança + escalada + App Check no ar)

Transformação de sistema pessoal em micro-SaaS a R$ 24,90/mês.

## Sessão de 10/08/2026 (continuação) — pareamento, painel gestor, marketing e caminho pro WhatsApp oficial

- **Investigação do código de pareamento**: relato de cliente sem conseguir
  conectar. Testado ao vivo contra o servidor Evolution — funciona; o
  comentário no código que dizia "quebrado, foi removido" estava
  desatualizado (sobrou de uma versão anterior). Corrigido o comentário e
  reforçada a UX de expiração do código (aviso antes de gerar, dica quando
  dá "código inválido").
- **Painel `/plataforma`**: lista de famílias agora mostra nome+telefone de
  quem cadastrou, não só o nome da família (evita confusão entre famílias
  homônimas — nome não é identificador, `householdId` é).
- **Cadastro público**: campo único "nome" virou Nome + Sobrenome. Placeholder
  do telefone (cadastro, tela de conectar WhatsApp, mensagem de erro de
  validação) usava o número pessoal do Kirk como exemplo — trocado por
  `(11) 91234-5678` nos três lugares. "Nome (ex: Raquel)" também trocado por
  "ex: Ana" (mesmo cuidado já tomado nas artes de marketing).
- **Exclusão imediata pelo painel** (`apagar-agora`): novo botão no
  `/plataforma` pra apagar conta de teste sem esperar os 7 dias de
  arrependimento da LGPD, com confirmação por nome digitado. Reaproveita
  `tools/apagar-familia.js` (mesma implementação, dois pontos de entrada).
  **Achado no primeiro uso real**: apagar uma família com o WhatsApp
  desconectado no momento não desvincula o aparelho de verdade do lado do
  WhatsApp (logout exige sessão aberta) — o mesmo número não consegue
  parear de novo até o WhatsApp expirar a sessão sozinha ou o aparelho
  antigo ser removido manualmente em "Aparelhos conectados". Corrigido:
  `apagarFamiliaAgora` agora loga e avisa (`avisoWhatsapp`) quando isso
  acontece, em vez de falhar em silêncio. Detalhe em "Armadilhas já pagas"
  do `CLAUDE.md`.
- **4 artes de Instagram novas** (família compartilhando conta, praticidade
  do áudio, cadastro fácil de membros, clareza na decisão), com fotos reais
  fornecidas pelo Kirk, em `RevelaCash/instagram-lancamento/21-24-*.png` +
  legendas completas em `21-24-legendas.txt`.
- **Pesquisa: caminho pra API oficial do WhatsApp + risco de ban da
  Evolution API** — ver seção própria abaixo, "Caminho pro WhatsApp
  oficial (Cloud API / OBA)".

## Caminho pro WhatsApp oficial (Cloud API / OBA) — pesquisado em 10/08/2026

Pesquisado contra a documentação oficial da Meta for Developers (não só
blogs de terceiros). **Correção importante**: as notas antigas deste
arquivo diziam que a Official Business Account "sai via Meta Verified" —
isso misturava dois caminhos diferentes. Meta Verified é uma **assinatura
paga** (~R$ 69,90/mês), pensada pra empresa pequena usando o app comum do
WhatsApp Business. OBA é **gratuita**, via verificação de negócio (CNPJ) +
tempo de uso da Cloud API — é o caminho certo pra quem já está na
plataforma, como o RevelaCash.

Passo a passo:
1. **Cloud API**: conta no Meta Business Suite com dados da Lion Tech
   (CNPJ, endereço, e-mail corporativo, site) → criar app no Meta for
   Developers com produto WhatsApp → criar/vincular WABA → registrar um
   **número de telefone dedicado do operador** (não pode ser o pessoal —
   mesmo problema de "dispositivo vinculado" resolvido na sessão de hoje
   se aplicaria aqui) → gerar token de usuário do sistema. 1 a 3 dias se a
   verificação correr bem.
2. **Verificação de negócio** (Meta Business Manager): documentos legais
   da Lion Tech. Prazo variável — é o que mais demora, vale pedir cedo.
   **Já feita** — confirmado em 10/08/2026 no portfólio empresarial "Lion
   Tech" (Business ID 1140397533171413): status "Verificada" desde
   18/10/2025. Vale pra qualquer WABA/app novo criado dentro do mesmo
   portfólio, não precisa reverificar. Pula direto pra passo 1 (WABA + app
   + número dedicado)
3. **Official Business Account**: exige (a) cumprir a política de
   mensagens comerciais, (b) 30 dias na WhatsApp Business Platform, (c)
   verificação de negócio feita, (d) autenticação em duas etapas no
   número, (e) nome de exibição aprovado. Pedido pelo WhatsApp Manager →
   Phone numbers → Profile → Official Business Account → Submit Request.
   Recusou, espera 30 dias pra tentar de novo. Sem custo.
4. **Groups API**: libera automaticamente com a OBA, sem exigência extra.
   8 participantes por grupo, 10.000 grupos por número, cobrança por
   mensagem.

Fontes: [Official Business Accounts — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/),
[Groups API — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups),
[Request a WhatsApp Official Business Account — Meta Business Help Center](https://www.facebook.com/business/help/604726921052590).

### Risco de ban usando Evolution API (Baileys) — pesquisado em 10/08/2026

Risco real, não teórico: Evolution/Baileys reproduz o protocolo do
WhatsApp Web de forma não-oficial, o que viola os Termos de Serviço do
WhatsApp por definição — a Meta pode mudar o protocolo a qualquer
momento (risco de quebra de serviço, categoria à parte de risco de ban).

O perfil de risco do RevelaCash é mais baixo que o cenário típico dos
artigos sobre o tema (que falam de disparo em massa pra contato frio,
alto volume, comportamento de spam) — o uso aqui é poucas mensagens por
dia, dentro de conversa que já existe (a pessoa falando consigo mesma ou
com a própria família), sem mensagem não solicitada. Reduz a chance, não
zera. Não dá pra prometer ao cliente que o WhatsApp pessoal dele nunca
vai ter problema — é exatamente por isso que a migração pra Cloud API
(seção acima) está no roadmap: só ela tira esse risco de vez, porque o
número que fala com o cliente passa a ser institucional.

## Sessão de 09-10/08/2026 — auditoria de segurança, escalada e Firebase App Check

Pedido inicial do Kirk: varredura de segurança de ponta a ponta no sistema em
produção. Depois de corrigido, pediu também os 4 pontos de "pronto para
escalar" e artes de Instagram pra divulgação — sessão longa, em blocos.

### Bloco 1 — auditoria de segurança (achados e correções)

Três agentes de exploração em paralelo (backend, frontend, config/segredos).
Achados **bons confirmados**: Firestore com `allow read, write: if false`
(cliente nunca acessa direto), isolamento de tenant já testado, HMAC+anti-replay
no webhook do Mercado Pago, segredos só no Secret Manager, nenhum
`dangerouslySetInnerHTML`/XSS, nenhum arquivo sensível no git.

**Achados reais corrigidos:**
- `categoryId`/`paymentMethodId` aceitos sem checar se são da própria família
  em `transactionService.js`/`recurringBillService.js`/`budgetService.js` —
  um ID Firestore de outra família (se descoberto por outro canal) vazava
  nome/cor de categoria/forma de pagamento alheia num lançamento. Corrigido
  com `dados.buscarDoc()` (já existia em `escopo.js`) antes de gravar.
- `/auth/register` e `/auth/me` sem validação de schema — os `zod` schemas
  existiam em `validators/auth.js` mas nunca eram importados em rota
  nenhuma, e estavam desatualizados (pediam senha, que essas rotas nunca
  recebem). Reescritos e conectados.
- CORS aberto (`*`) por padrão quando `ALLOWED_ORIGINS` não estava setado.
  Restrito à lista fixa de domínios de produção.
- `whatsappLogService.updateLog` atualizava por ID cru, sem checar
  `householdId` — seguro na prática (só chamado internamente com ID recém-
  criado), mas sem barreira própria. Migrado para `dados.atualizar()`.
- Headers de segurança (CSP, HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) ausentes no `vercel.json` — adicionados.
- `middlewares/auth.js` e `middlewares/webhookAuth.js` sem teste unitário
  dedicado — `auth.js` precisou virar fábrica (`criarAuthMiddleware`) pro
  teste não arrastar o Firebase Admin real, mesmo padrão de `escopo.js`.

**Achado crítico ANTES de qualquer deploy**: o plano original ia restringir o
CORS só a `financeiropessoal-tau.vercel.app`. O domínio real usado pelos
clientes ativos é **`revelacash.com.br`** (confirmado no `ESTADO.md` da
sessão de 08/08) — se tivesse ido pro ar como planejado, o primeiro deploy
trancava o Kirk e a Raquel fora do próprio sistema. Corrigido antes do
primeiro `firebase deploy`.

Testado: suíte completa, build do frontend servido localmente com os mesmos
headers do `vercel.json` (script `serve-csp.js` no scratchpad), aberto no
navegador de verdade — zero erro de console, zero violação de CSP, chamada
real ao Firebase Auth confirmada saindo. Deploy feito e reverificado ao vivo
(`curl` nos headers de `revelacash.com.br`, CORS preflight na origem real e
numa origem estranha).

### Bloco 2 — teto de IA por família

Pedido à parte do Kirk, depois de eu explicar o risco (número comprometido
ou automação gerando chamada de IA sem limite, custeada pelo projeto — a
assinatura é fixa, não por uso; e como a chave Gemini é uma só, uma família
sozinha podia derrubar a IA de todo mundo estourando cota).

`limiteIAService.js` — `verificarLimiteDeIA(householdId)`, transação atômica
no Firestore, contador em `whatsappConfigs/{householdId}.iaContagemDiaria` +
`.iaContagemData` (reseta sozinho quando a data muda). Padrão 60/dia,
ajustável via `LIMITE_DIARIO_IA`. Plugado nos 3 pontos reais de chamada ao
Gemini em `lancamentoPorMensagem.js` (texto via IA, transcrição de áudio,
leitura de cupom) — mensagem que o parser por regra resolve não conta nada.

### Bloco 3 — os 4 pontos de escalada

- **`npm audit`**: 23 de 39 vulnerabilidades corrigidas nos dois projetos
  sem `--force` (sem breaking change). As 16 restantes exigiriam upgrade
  major (`firebase-admin` 14, `vite` 8→rolldown) — não forçado; confirmado
  que o backend não usa `@google-cloud/storage` (caminho vulnerável morto) e
  que o do frontend é só do dev server do Vite, não do bundle publicado.
- **Rate limit por família**: `limiteMensagensService.js`, 40 mensagens/min
  por família, em memória, silencioso (sem resposta no WhatsApp — não
  alimentar rajada com mais tráfego). Independente do limite global de
  120/min do webhook (que é por instância/compartilhado entre famílias).
- **CI mínimo**: `.github/workflows/ci.yml` — testes do backend + build do
  frontend em todo push/PR pra `main`. Confirmado rodando com sucesso via
  API pública do GitHub depois do primeiro push.
- **Firebase App Check**: ver bloco 4, foi a parte que deu trabalho de verdade.

### Bloco 4 — Firebase App Check: rollout com dois incidentes reais em produção

App Check confirma que quem chama a API é o painel publicado, não um script
direto no endpoint com um token de usuário vazado por outro caminho.
Implementado em duas frentes desde o início (`middlewares/appCheck.js` no
backend, `initializeAppCheck` em `firebase.js` no frontend), desligado por
padrão (`APP_CHECK_ENFORCE`/`VITE_RECAPTCHA_SITE_KEY`) até existir o site
key do reCAPTCHA v3 — que só o Kirk pode gerar (conta Google, sem CLI/API
pra isso; nem o Firebase CLI tem comando de App Check nesta versão).

Passo a passo dado ao Kirk: gerar chave reCAPTCHA v3 em
`google.com/recaptcha/admin` (domínios `revelacash.com.br`/`www.`), registrar
o app no Firebase Console → App Check. Ele mandou a site key rápido demais —
faltava eu ter checado meu próprio código antes de considerar pronto:

1. **Faltava o interceptor enviar o token.** App Check só anexa o header
   sozinho em chamadas de outros SDKs do Firebase, não numa API Express
   própria. Sem isso, ligar a exigência quebraria a API inteira na hora.
   Corrigido (`api.js` busca o token via `getToken()`, mesmo padrão do
   `Authorization: Bearer`) **antes** de qualquer deploy com enforcement.
2. Registro no Firebase Console pediu a **chave secreta** do reCAPTCHA, não
   a site key — eu tinha dito ao Kirk que só precisaríamos da site key,
   errado. Corrigido depois que ele mandou print da tela mostrando o campo.
3. Depois de registrado, teste automatizado (`agent-browser` headless) dava
   `App attestation failed` — não era bug, era o reCAPTCHA pontuando o
   navegador automatizado como bot corretamente. Confirmado testando com
   `--headed`: 200 OK.
4. **Liguei `APP_CHECK_ENFORCE=true` e testei com curl (sem preflight) —
   passou.** Deploy feito. **O Kirk reportou login quebrado em produção**:
   `curl` não simula o preflight `OPTIONS` que o navegador dispara sozinho,
   e `X-Firebase-Appcheck` não estava em `allowedHeaders` do CORS. Corrigido
   e deployado em minutos, confirmado com preflight simulado de verdade
   desta vez.
5. **Segundo aviso do Kirk, em aba anônima**: CSP bloqueando
   `recaptcha__pt_br.js` chamando `www.google.com/recaptcha/api2/clr`. Tinha
   liberado `google.com`/`gstatic.com` só em `script-src`/`frame-src`, não
   em `connect-src` — o script não só carrega de lá, troca dados o tempo
   todo. Corrigido, e desta vez testado numa sessão **nova e isolada**
   (`agent-browser --session teste-anonimo`) antes de avisar o Kirk: console
   limpo, todas as chamadas de reCAPTCHA/App Check em 200.

As 4 correções deste bloco (interceptor, CORS, CSP×2) e as armadilhas
específicas estão documentadas no `CLAUDE.md` ("Armadilhas já pagas") —
consultar antes de mexer em App Check, CORS ou CSP de novo.

Também corrigido nesta rodada: `vercel.live` liberado no CSP (widget de
feedback do próprio Vercel, cosmético, pedido do Kirk).

### Bloco 5 — nomes reais removidos das artes de marketing

O Kirk apontou que "Kirk" e "Raquel" apareciam em 3 das artes de Instagram
(exemplos ilustrativos de membros da família) e no texto do relatório —
trocados por papéis genéricos (Pai/Mãe/Filho/Avó) em todos os lugares,
artes re-renderizadas, relatório republicado.

### Bloco 6 — varredura final de confiança

Depois de tudo no ar: suíte completa (320 testes), build do frontend, CI
verde nos últimos 4 commits (API pública do GitHub), bateria de checagens
de saúde do backend via `curl` (health, CORS preflight em origem real e
estranha, App Check com token real, webhooks), e varredura visual em 5
páginas públicas de produção (`/`, `/login`, `/termos`, `/privacidade`,
`/plataforma`) em sessão nova do navegador — console limpo em todas.

**Não verificado nesta sessão** (não tenho como logar com credencial real
do Kirk): o fluxo autenticado completo (dashboard, criar lançamento) com
App Check habilitado. Testado de forma equivalente com um token de App
Check real extraído de uma sessão de navegador de verdade, direto contra o
backend via `curl` — comportamento correto confirmado (passa do App Check,
para na autenticação por falta de login). Vale o Kirk confirmar visualmente
o dashboard/lançamento numa próxima sessão dele.

Ferramentas de teste ponta a ponta com conta descartável já existem
(`tools/testar-assinatura-ponta-a-ponta.js`, `tools/testar-canal-ponta-a-ponta.js`)
mas exigem credencial de **teste** do Mercado Pago (`TEST-...`), e a
credencial ativa hoje é a de produção — não rodados nesta sessão por esse
motivo, não por falta de tentativa.

## Sessão de 08/08/2026 (parte 6) — áudio/foto testados com mensagem real, comando conversacional, landing page reescrita

Primeira vez que o Kirk usou áudio e foto de cupom com mensagens reais dele
mesmo no WhatsApp (a parte 4/5 tinham corrigido o modelo do Gemini, mas
nunca com uma mensagem real do dia a dia). Achou 2 bugs de verdade na hora.

**Bug 1 — cupom de churrascaria caiu em "Outros".** Confirmado direto no
Firestore: `description: "decio churrascaria"`, `categoryId:
default-expense-outros`. Causa: `CATEGORY_MAP` (financialParser.js) tinha
"restaurante", "pizza", "hamburguer" etc. em Alimentação, mas não
"churrascaria" — nem sinônimos comuns (lanchonete, padaria, açougue).
Corrigido ampliando a lista. É uma lacuna estrutural: qualquer estabelecimento
fora da lista cai em Outros em silêncio, sem erro nenhum.

**Bug 2 — áudio "gastei trident 4,50" virou R$ 50,00.** Investigado direto
no Firestore (não por suposição): a transação real tinha `description: "4 e
com Trident."`, `amount: 50`. O Gemini transcreveu o valor falado
("quatro e cinquenta") como dois números soltos — "4 e 50" — em vez de
"4,50". O parser por regra (`detectAmount`) varre a frase de trás pra frente
e pega o PRIMEIRO valor válido que encontra (ou seja, o ÚLTIMO da frase),
descartando o "4" em silêncio. Corrigido no PROMPT de transcrição
(`midiaParserService.PROMPT_AUDIO`), instruindo a IA a escrever valor falado
em reais-e-centavos como um número só com vírgula, nunca "X e Y" separado.

**Bug 3, achado testando eu mesmo (não reportado pelo Kirk) — mensagem com
2 lançamentos virava 1 errado.** "gastei 30 reais no mercado e 80 reais de
gasolina" virava um único lançamento de R$80 em Mercado, pelo mesmo motivo
do bug 2: o parser por regra só sabe extrair UM valor. Como a IA
(`aiParserService`) já sabia separar vários lançamentos numa frase desde o
início (só nunca era chamada porque o parser por regra "tinha sucesso"
primeiro, mesmo errado), a correção foi: `parseFinancialMessage` devolve
`null` sempre que a mensagem tem mais de um valor numérico plausível,
deixando a IA assumir. Confirmado com chamada real ao Gemini: 2 e depois 3-4
lançamentos na mesma frase, todos separados corretamente.

**Comando conversacional pelo WhatsApp — pedido do Kirk.** Antes só existia
o comando exato "apagar ultimo". Adicionado:
- Sinônimos naturais que apagam o último lançamento quando são a mensagem
  INTEIRA (não substring, pra não disparar sozinho no meio de uma frase
  qualquer): `errado`, `apaga`, `apagar`, `cancela`, `cancelar`, `errou`,
  `ta errado`, além do "apagar ultimo"/"desfazer" que já existia.
- `categoria <nome>` (ou "mudar categoria X"/"trocar categoria para X") —
  muda a categoria do último lançamento. Casa por nome exato
  (sem acento/maiúscula) contra as categorias já cadastradas do mesmo tipo;
  se não achar, avisa em vez de adivinhar.
- Os dois passaram a respeitar o bloqueio de assinatura vencida (regra 6) —
  gap que já existia até no "apagar ultimo" original: comando de escrita via
  WhatsApp não checava `bloqueioPorAssinatura`.
- Não é IA entendendo conversa livre — de propósito. Frase livre por IA
  arriscaria apagar lançamento por ambiguidade ("nossa, que dia errado" não
  pode acionar nada). Reconhecimento de frase curta e exata, mesmo padrão já
  usado pelos outros comandos.

284 testes (280 → 284, casos de churrascaria/padaria/açougue e valor
decimal colado vs. separado). `firebase deploy --only functions:api` feito
duas vezes nesta sessão (uma por bloco de correção).

**Landing page reescrita do zero — pedido do Kirk.** Ele entregou a
identidade visual definitiva (arquivos já conhecidos da sessão de marca,
07-08/08) e 5 fotos novas de produto (mockups de app gerados, não fotos de
cliente real) em `C:\Users\Predator\Documents\Revela Cash Identidade
Visual`. Processadas com Pillow → WebP (55-95 KB cada) em
`frontend/public/brand/marketing/`: mesa cheia de contas + celular com o
painel, homem apontando pro painel, mulher parada no carro no posto gravando
áudio, mulher executiva com tablet, e o print real do WhatsApp mostrando
cupom + áudio sendo processados.

Primeira versão: estrutura toda reescrita (hero, "3 jeitos de lançar",
benefícios, individual/casal/família, painel, diferencial, resultado,
preço, FAQ com 2 perguntas novas sobre áudio/foto e segurança de dados),
copy focada nos 2 recursos de IA como diferencial. Testei com um efeito de
"revelar ao rolar" (IntersectionObserver) que **quebrou** — rolando de
verdade a página ficava em branco por um bom trecho antes das seções
aparecerem, timing do observer não confiável. Removido antes de qualquer
publicação (nunca foi ao ar quebrado).

Feedback do Kirk pediu mais: "a logo só aparece colorida no topo, o resto é
cortado ou com transparência"; "expanda as imagens, seja designer avançado,
crie elementos"; "pesquise landing pages de alta conversão e copie com
nossas imagens"; e um alerta de segurança — a foto da mulher no carro tinha
legenda "até dirigindo, sem tirar as mãos do volante", sugerindo uso de
celular em movimento, quando a cena real é ela PARADA no posto (dá pra ver a
bomba de combustível atrás dela).

Segunda passada:
- Pesquisado (WebSearch) padrões de landing page de alta conversão antes de
  aplicar: bento grid (67% das SaaS top do ProductHunt em 2026), produto/tela
  real no hero converte mais que ilustração, gradiente sutil pra
  profundidade.
- Ícone 3D colorido da marca (`icon-color-1024.webp` — já processado com
  fundo removido numa sessão anterior) usado em tamanho real, opacidade
  quase total, em 4 pontos: saindo de trás da foto no hero, numa seção nova
  só de marca ("Conversa de um lado. Clareza financeira do outro."), no CTA
  final, e mais forte na seção de preço. Antes era só uma marca d'água a 10%
  de opacidade, quase invisível.
- "Três jeitos de lançar" virou bento grid: tela real do WhatsApp em bloco
  grande (2 colunas x 2 linhas), os 3 cards de recurso ao redor, foto do
  posto como bloco largo com legenda sobreposta (gradiente escuro por cima
  da foto, texto branco).
- Legenda do carro corrigida: "Direto do posto, sem digitar nada — parada
  pra abastecer, ela grava um áudio". Deixa explícito que está parada, sem
  qualquer menção a dirigir.
- Fotos do painel e do resultado ganharam chip flutuante (mesmo padrão do
  hero: cartão branco com ícone + dado, tipo "Saldo do mês — R$ 3.220,00"),
  em vez de retângulo simples com borda.

Testado com `npm run build` + `agent-browser` a cada iteração (desktop,
mobile 390px, CTA abrindo o modal de cadastro, FAQ abrindo/fechando,
console sem erro) antes de mostrar pro Kirk. Descoberta de metodologia:
`agent-browser screenshot --full` não dispara scroll de verdade, então
`loading="lazy"` e observers baseados em IntersectionObserver aparecem como
"quebrados" (imagem em branco) na captura de página inteira mesmo
funcionando perfeitamente pra um usuário rolando — sempre confirmar rolando
de fato antes de reportar bug de imagem/animação.

Aprovado pelo Kirk e publicado: `git push` → Vercel (deploy automático),
confirmado ao vivo em `revelacash.com.br` com `agent-browser`, idêntico ao
testado local.

## Sessão de 08/08/2026 (parte 5) — bugs reais achados testando de verdade, painel gestor virou portal separado

Depois da entrega da parte 4 (abaixo), o Kirk testou de verdade e achou dois
problemas que a sessão anterior não tinha exercitado: áudio/foto do WhatsApp
falhando, e o painel gestor "misturado" com o menu da própria família dele.
Os dois eram bugs reais, não mal-entendido — corrigidos nesta sessão, com
teste de ponta a ponta desta vez.

**Áudio e foto de cupom falhando — não era cota, o modelo tinha sido
desligado.** Log de produção: `[MidiaParser] Gemini retornou 429`. Parecia
cota (o Kirk até comprou R$100 de crédito no Gemini por causa disso), mas o
`gemini-2.0-flash` usado desde o início do projeto **foi desligado pelo
Google em 01/06/2026** — confirmado via `WebFetch` na documentação oficial.
Isso quebrou dois pontos ao mesmo tempo:
- `midiaParserService.js` (áudio/foto, feature nova desta sessão)
- `aiParserService.js` (fallback de IA do parser de texto, existente desde
  muito antes) — estava quebrado **silenciosamente havia mais de dois
  meses**, sem ninguém perceber porque o parser por regras cobre a maioria
  das mensagens.

Trocado pro `gemini-3.6-flash` (modelo Flash estável atual, confirmado com
uma chamada real usando a chave de produção antes do deploy — HTTP 200).
De quebra, `midiaParserService.chamarGemini` ganhou uma tentativa extra
automática em 429/503 (passageiro) e uma mensagem diferente de "não
entendi o áudio" para esse caso.

Preço do `gemini-3.6-flash` é ~15x mais caro por token que o antigo (US$1,50
input / US$7,50 output por 1M tokens, tarifa única pra texto/imagem/áudio),
mas ainda assim irrisório no volume de 5 famílias — estimativa de 8 a 12
meses pros R$100 já comprados. Sem conta fechada; recomendado o Kirk olhar
o painel de uso do Google depois de uma semana de uso real.

**Painel gestor virou de verdade um portal separado, não mistura mais com
conta de família.** O Kirk viu o painel `/portal-rc-9f21` abrindo dentro do
mesmo Sidebar da conta pessoal dele (mesmo e-mail = mesma sessão = mesmo
layout) e pediu login próprio, usuário/senha, URL nova.

Duas causas descobertas ANTES de chegar na causa raiz de verdade (ambas
corrigidas, nenhuma foi a explicação final):
1. Login sempre mandava pro `/dashboard`, nunca de volta pra rota que a
   pessoa tinha pedido — corrigido com `state={{from: location}}` no
   `PrivateRoute` + `AuthForm` lendo esse state.
2. **A causa real**: `TourContext.jsx` (tour guiado de primeiro uso) força
   navegação pro `/dashboard` uns 900ms depois de QUALQUER login, se o
   navegador nunca viu o flag de "já visto" no localStorage — o que é
   sempre o caso em aba anônima ou navegador novo. Sobrescrevia o fix do
   item 1. Corrigido: só auto-inicia partindo do `/dashboard`.

Depois desses dois fixes, a arquitetura pedida foi construída do zero:
- `tools/criar-login-operador.js` — cria uma conta de Firebase Auth
  separada (usuário `kirkdouglas_19`, senha gerada e mostrada só uma vez no
  terminal, nunca salva em arquivo), traduzida pra um e-mail interno
  (`@operador.revelacash.internal`, não é caixa real) só porque o Firebase
  Auth exige formato de e-mail. Sem household, sem relação com nenhuma
  família.
- `PlataformaPage.jsx` — rota `/plataforma`, FORA do `PrivateRoute`/
  `AppLayout` da família. Formulário próprio (usuário/senha, fundo escuro,
  visual distinto). Depois de autenticar, confirma acesso admin de verdade
  chamando `/plataforma/metricas` antes de mostrar qualquer coisa. Painel em
  si (`AdminPage.jsx`, reaproveitado) renderiza dentro de um header minimalista
  próprio ("Portal do Operador — RevelaCash" + Sair), sem o Sidebar da família.
- Rota renomeada de `/portal-rc-9f21` para `/plataforma` (frontend e
  backend). `ADMIN_EMAILS` ganhou o e-mail interno da conta nova,
  `kirkpetri@gmail.com` continua valendo também (redundância inofensiva).
- **Limitação aceita, documentada no código**: Firebase Auth mantém uma
  sessão só por navegador. Logar no portal troca a sessão ativa — quem
  estava logado como família em outra aba do mesmo navegador passa a
  "ver" a sessão do operador até logar de novo como família. Pra ter as
  duas contas abertas ao mesmo tempo, precisa de outro navegador ou janela
  anônima.

**Testando pela primeira vez com acesso real de admin, achei mais dois bugs
que a sessão anterior não pegou** (fazia sentido: antes eu não tinha como
logar como admin pra testar):
- Drill-down de família (clicar numa linha da tabela) quebrava **sempre**,
  com `FAILED_PRECONDITION: The query requires an index`.
  `adminAuditService.listarPorFamilia` fazia `where('householdId','==',x)
  .orderBy('createdAt','desc')` — Firestore exige índice composto pra
  `where`+`orderBy` em campos diferentes, e a coleção nunca tinha sido
  consultada antes, então o índice nunca foi criado. O dublê de Firestore
  dos testes automatizados não reproduz essa exigência — por isso passou
  limpo em 280 testes e quebrou 100% das vezes em produção. Corrigido
  ordenando em memória (coleção pequena por família, não precisa de
  índice).
- A data na seção "Auditoria do painel" aparecia como "-". Timestamp do
  Firestore não sobrevive ao `res.json()` como objeto usável (vira
  `{_seconds,...}`), o frontend não conseguia formatar. Corrigido
  convertendo pra ISO antes de responder.

**Testado de verdade desta vez**, os 8 botões do painel, um por um, contra
uma família de teste criada e apagada na hora (via `agent-browser`, login
real com o usuário/senha do operador): drill-down, registrar pagamento
manual (+30 dias), sincronizar com o provedor, marcar/desmarcar cortesia,
bloquear/desbloquear acesso, cancelar assinatura. Todos funcionando,
histórico de cobrança e auditoria aparecendo certos, zero erro no console.

Backend deployado (`firebase deploy --only functions:api`, várias vezes ao
longo da sessão) e frontend publicado (push → Vercel) a cada correção.

## Sessão de 08/08/2026 (parte 4) — Fase 4 completa e painel gestor

Pedido do Kirk: terminar a Fase 4 inteira (orçamento por categoria, contas
fixas recorrentes, fatura de cartão, áudio transcrito, foto de cupom) e criar
um painel administrativo de verdade para gerir os clientes do SaaS. Tudo
entregue de uma vez, com `npm test` verde a cada peça (280 testes no total,
92→280 nesta sessão), backend já deployado e frontend já publicado.

**Orçamento por categoria** — `budgets` (já reservada em `escopo.js`),
`budgetService.js`: limite mensal fixo por categoria (não por mês — vale até
mudar), `resumoDoMes` junta com as despesas confirmadas do mês e marca
estouro. Alerta só no painel (Dashboard + `/orcamento`), sem WhatsApp —
decisão do Kirk para não abrir custo variável de template pago antes de
precificar isso. Testado no navegador: orçamento de R$10 em Mercado, gasto
de R$50 → "Estourou", barra vermelha, 500%.

**Contas fixas recorrentes** — `recurringBills`, `recurringBillService.js`.
Job diário (`gerarContasRecorrentes`, 04:00 BRT) varre todas as famílias
(mesma exceção cross-tenant do job de LGPD) e lança sozinho quem vence hoje,
`origin: 'RECURRING'`. `dueDay` trava no último dia válido do mês (31 em
fevereiro vira 28). Painel `/contas-recorrentes` mostra "Próximas a vencer"
— o lembrete pedido, só visual. Testado: conta "Aluguel" dia 10 apareceu
certo na lista de próximas.

**Fatura de cartão de crédito** — `paymentMethods` ganhou `isCreditCard`,
`closingDay`, `dueDay` (endpoint de criação e edição agora validados por
zod, antes só aceitava `name` cru). `creditCardInvoices` nova, adicionada em
`COLECOES_ESCOPADAS`. `invoiceService.cicloDaData` decide de qual fatura uma
compra é (depois do fechamento vira ciclo seguinte); a fatura "aberta" é
sempre calculada na hora, nunca gravada — só quando o job de fechamento
(`fecharFaturas`, 04:30 BRT) roda é que vira documento com total congelado.
`marcarComoPaga` é ação manual do usuário, sem tocar em cobrança. Testado:
cartão fechando dia 5/vencendo dia 12, hoje é 8 → fatura mostrou corretamente
"fecha em 05/09, vence em 12/09" (já no ciclo seguinte).

**Áudio transcrito e foto de cupom** — `evolutionProvider.baixarMidia`
(endpoint `getBase64FromMediaMessage`, **não testado contra o servidor
real** — sem uma mensagem de mídia de verdade chegando pelo webhook não dá
pra confirmar o formato exato da resposta; tratar como não verificado, igual
`cloudApiProvider.js`). `midiaParserService.js` chama o Gemini multimodal e
devolve TEXTO em linguagem natural (não a transação já estruturada), que
depois passa pelo MESMO `lancarPorTexto` que o WhatsApp digitado já usa —
evita duplicar a resolução de categoria/forma de pagamento/pagador.
`evolutionWebhook.js` agora processa `AUDIO`/`IMAGE` de verdade (antes
respondia "ainda não implementado"); `DOCUMENT` continua pendente. Guarda de
tamanho de 8MB antes de mandar pro Gemini.

**Painel gestor** — pedido do Kirk: dashboard de clientes, jeito de marcar
pagamento como recebido manualmente, desativar acesso, "tudo que um painel
admin deve ter", numa URL não óbvia (hoje `/admin` é fácil de adivinhar).
- URL trocada para `/portal-rc-9f21` (frontend e backend) — a proteção real
  continua sendo `apenasAdmin` (custom claim ou `ADMIN_EMAILS`, fail-closed);
  a URL estranha só evita descoberta casual. Testado: conta de teste
  (não-admin) na URL nova → "Acesso restrito", sem vazar nada.
- `assinaturaService.registrarPagamentoManual` — ativa a assinatura sem
  falar com o Mercado Pago, marca `provider: 'manual'`. **Quebra a regra de
  "só o provedor promove pra active" de propósito e com autorização
  explícita do Kirk**: é ação de operador (Pix fora do sistema, negociação),
  nunca do cliente, atrás de `apenasAdmin`, função separada do webhook,
  sempre auditada.
- `assinaturaService.bloquear/desbloquear` — bloqueio manual do operador.
  `estado.js` (`situacaoDaAssinatura`) dá prioridade a esse campo sobre
  trial/ativo/carência. Continua só bloqueio de ESCRITA (regra 6): quem está
  bloqueado assim ainda lê e exporta o histórico.
- `marcarComoInterna`/`desmarcarInterna` — mesmo efeito de
  `tools/marcar-conta-interna.js`, agora um botão em vez de só CLI.
- `adminAuditService.js` — toda ação de escrita do painel grava quem fez, o
  quê, em qual família e quando, em `adminAuditLog` (cross-tenant por
  natureza, mesma exceção de `routes/admin.js`).
- Frontend: `/portal-rc-9f21` agora tem drill-down por família (clicar na
  linha) com os botões acima, histórico de cobrança e auditoria.

**Lacuna encontrada e corrigida durante o teste**: as três coleções novas
não entravam em `lgpdService.exportarDados`/`apagarHousehold` — um cliente
pedindo exclusão (ou o operador limpando conta de teste com
`apagar-familia.js`, que reaproveita o mesmo código) ficaria com orçamento,
contas fixas e faturas órfãos no Firestore. Corrigido antes do deploy;
dois documentos órfãos da família de teste desta sessão foram apagados à
mão (a família em si já tinha sido apagada corretamente).

**Deploy**: `firebase deploy --only functions` rodado nesta sessão (mesmo
truque do `FUNCTIONS_DISCOVERY_TIMEOUT=30000`), confirmado com
`tools/diagnostico-assinatura.js` (5 famílias, ninguém bloqueado) antes do
`git push` do frontend.

Testado no navegador com conta de teste descartável (`agent-browser`,
backend local contra o Firestore real, igual sessões anteriores) — cadastro,
orçamento, contas fixas, faturas, e o 403 do painel admin. **Não testado no
navegador**: os botões de ação do painel admin em si (pagamento manual,
bloquear, etc.) — exigem login com um e-mail em `ADMIN_EMAILS`, que é o
e-mail do Kirk; a lógica por trás está coberta por 25 testes automatizados
em `assinaturaService.test.mjs`, mas o clique na tela real fica para o Kirk
conferir.

## O que falta — lista consolidada (08/08/2026)

Ler isto primeiro ao retomar. Detalhe e contexto de cada item nas seções
abaixo; isto é só o índice do que ainda não está feito.

**Só o Kirk pode fazer (conta dele, cartão dele, ou decisão de negócio):**
- [x] Rodar `firebase deploy --only functions --project financeiropessoal-29b32`
      — feito em 08/08/2026. Precisou de `$env:FUNCTIONS_DISCOVERY_TIMEOUT=30000`
      porque o Windows (antivírus escaneando os módulos) passou dos 10s padrão
      de descoberta do Firebase — não era erro de código. Confirmado com
      `tools/diagnostico-assinatura.js`: 3 famílias, ninguém bloqueado
- [x] Trocar `MERCADOPAGO_ACCESS_TOKEN` para credencial de **produção** —
      feito em 08/08/2026. Ativado no painel do MP (setor "Outros", site
      `https://www.revelacash.com.br`), gravado via `firebase
      functions:secrets:set`, validado com `tools/testar-credencial-mp.js`
      (HTTP 200, ambiente PRODUÇÃO, acesso a `/preapproval` confirmado)
- [x] Cadastrar o webhook na aba de produção do MP — feito, URL
      `https://southamerica-east1-financeiropessoal-29b32.cloudfunctions.net/api/webhooks/mercadopago`,
      segredo gravado em `MERCADOPAGO_WEBHOOK_SECRET`. Redeploy feito para os
      dois secrets novos entrarem em vigor
- [ ] Testar uma assinatura real com cartão de verdade e conferir a transição
      `pending → active` — não dá para automatizar: o checkout redireciona
      pro `init_point` hospedado pelo próprio Mercado Pago (não há Public Key
      no frontend, não há como injetar cartão por script). Tentativa em
      07/08/2026: Kirk chegou até o checkout (confirma que preapproval +
      redirect funcionam com credencial de produção — família nasceu com
      `status: pending` e `provider: mercadopago` certos) mas não completou o
      pagamento de propósito. Família de teste ("Lion") apagada depois
      (backup antes, `tools/apagar-familia.js`). Kirk vai testar de outra
      forma mais adiante
- [x] Registrar `revelacash.com.br` — feito 07/08/2026. DNS apontado pra
      Vercel (`A @ 76.76.21.21` e `A www 76.76.21.21`, sem CNAME/nameserver),
      domínio vinculado ao projeto `financeiropessoal` via `vercel domains
      add`, HTTPS emitido automaticamente. `revelacash.com` ainda não
      registrado
- [x] Mockup final do logo — recebido e implementado 08/08/2026 (ver sessão
      abaixo). Era só wordmark; agora tem ícone (balão de chat + lupa com
      gráfico, metade roxa/metade verde) em várias variantes
- [x] Fotos reais para a landing — feito 08/08/2026 (parte 6). O Kirk
      forneceu 5 mockups de produto (não são fotos de cliente real, sem
      depoimento nem nome atribuído), processados pra WebP e usados em bento
      grid na landing nova, aprovada e publicada
- [ ] Migrar pro canal WhatsApp oficial: registrar número dedicado do
      operador na Cloud API, passar pela verificação de negócio da Lion
      Tech (CNPJ), rodar 30 dias na plataforma e então pedir a **Official
      Business Account** — gratuita, não depende de Meta Verified (ver
      correção em 10/08/2026, pesquisa contra a documentação oficial da
      Meta)
- [x] Revisar a landing nova em produção e aprovar — feito 08/08/2026 (parte
      6), duas passadas (primeira versão + ajustes de design pedidos pelo
      Kirk), publicada em `revelacash.com.br`
- [x] Painel gestor virou portal separado (`/plataforma`, login próprio
      usuário/senha) e teve todos os 8 botões testados um a um — feito
      08/08/2026 (parte 5). Credenciais: usuário `kirkdouglas_19`, senha
      só existe na cabeça do Kirk (gerada e mostrada uma vez no terminal,
      nunca gravada em arquivo). Pra resetar: `node
      tools/criar-login-operador.js --confirmar` (gera senha nova,
      mostra uma vez, precisa de `firebase deploy --only functions:api`
      só se o e-mail interno mudar — a senha por si só não precisa
      redeploy)

**Decisão em aberto — qual a próxima frente de trabalho:**
1. Ampliar o parser (casos que ainda caem na IA por engano)
2. Convite de membro com login próprio (hoje um 2º login vira outra família)
3. Tutorial de primeiro uso (Kirk pediu pra deixar por último; o tour
   guiado interativo já existe — isto seria material escrito/vídeo à parte)

~~4. Testar áudio e foto de cupom com uma mensagem de WhatsApp de verdade~~ —
feito 08/08/2026 (parte 6), com mensagem real do próprio Kirk. `baixarMidia`
funcionou (download da mídia sem erro); 2 bugs reais achados e corrigidos na
interpretação (valor do áudio virando 10x maior, categoria de estabelecimento
não mapeada) — ver detalhe na sessão parte 6.

**Dívidas técnicas conhecidas, sem prioridade definida** (detalhe no fim do
arquivo, seção "Dívidas conhecidas"): README desatualizado, pasta `backend/`
morta, rate limit só em memória, `cloudApiProvider.js` nunca testado contra
API real — bundle do frontend ~1,3 MB sem code splitting, zero testes
automatizados no frontend, `/plataforma` não pagina a lista de famílias (ok
para dezenas, dói em milhares), uma instância Evolution por família (limite
de VPS não medido).

## Sessão de 07/08/2026 — marca, redesign visual e landing page

Nome fechado: **RevelaCash** (domínios `revelacash.com.br` e `revelacash.com`
confirmados livres via RDAP em 06/08 — registro é ação do Kirk, ainda não
feito). Paleta roxo profundo (`#5b21b6`), tipografia Outfit + JetBrains Mono
promovida de global. Detalhe do plano completo, decisões de arquitetura e
riscos mapeados: `C:\Users\Predator\.claude\plans\fluttering-dreaming-lynx.md`.

Feito e testado (build limpo, 247 testes de backend, verificado com Playwright/
agent-browser em produção, sem erro de console):
- Redesign completo do frontend (login, dashboard com sparkline+contagem
  animada, sidebar/header, settings em 3 abas, todas as páginas restantes)
- Componentes acessíveis (Tabs/Dialog/DropdownMenu) via `radix-ui` direto —
  **não** via CLI do shadcn, que só gera código Tailwind v4 (incompatível
  com o v3 deste projeto)
- Landing page nova em `/` — estrutura, copy, preço, mini-recriação do
  dashboard com os mesmos tokens (não é screenshot real ainda)
- Parser: `pagamento`, `recebimento`, `ganho`, `saída` adicionados como tipo
  — corrige `Pagamento cartão 1830`, que falhava. `Lanche 38,00 crédito`
  continua caindo na IA de propósito (categoria não é palavra de tipo)
- Trial: 14 → 7 dias (constante estava duplicada em `estado.js` e
  `householdService.js`; unificada). Famílias já existentes não são afetadas
  (`trialEndsAt` é gravado na criação, não recalculado)

**Importante — estado do deploy:**
- **Frontend**: já está em produção. O `git push` disparou deploy automático
  via integração Vercel↔GitHub (não era a intenção original — o plano era
  deixar só commitado para o Kirk revisar antes. Uma vez commitado e no
  `main`, o Vercel publica sozinho). Verificado ao vivo com conta de teste
  descartável (criada e apagada com `tools/apagar-familia.js` — zero resíduo).
- **Backend**: código commitado e com teste local verde, mas **não
  deployado** — `firebase deploy --only functions --project
  financeiropessoal-29b32` ainda não foi rodado. O parser novo e o trial de
  7 dias só valem depois desse deploy.

Pendências que ficaram para o Kirk decidir/fazer (não são falta de tempo, são
decisões ou acessos que só ele tem):
- Registrar o domínio revelacash.com.br/.com
- Mockup final do logo (hoje é wordmark provisório, texto só)
- Fotos de pessoas reais para a landing (banco licenciado ou fotos próprias)
- Rodar `firebase deploy` quando quiser publicar o backend
- Revisar o site em produção e decidir se mantém no ar como está

## Sessão de 07/08/2026 (parte 2) — onboarding, trial banner, login inline

Feito e testado (build limpo, 247 testes de backend, fluxo completo verificado
com Playwright/agent-browser em produção local — cadastro real, tour do
início ao fim, sem erro de console):

- **Tour guiado de primeiro uso** (`react-joyride` v2 — a v3 mudou a API pra
  hooks e quebrava o render; ficou registrado no código). Dispara sozinho no
  primeiro login (marcado por `localStorage`, por navegador — não por
  família, então trocar de aparelho mostra de novo), atravessa Configurações
  (escolha do modo de uso) → Dashboard → Lançamentos → Categorias → WhatsApp
  → botão Relatório. Cada página é um Joyride de 1 passo só; quem navega
  entre rotas é o `TourContext`, não o Joyride. Reabertura manual pelo menu
  do usuário ("Tour guiado"). Sem botão "Pular" visível — o Joyride só
  mostra esse botão quando o array de passos tem mais de 1 item, e aqui
  sempre tem 1; o "Fechar" (X, sempre visível) cobre ignorar/dispensar.
- **Login/cadastro inline na landing**: extraído para `AuthForm`, reutilizado
  num modal (Dialog do radix) que abre por cima da própria landing — não
  navega mais pra `/login` ao clicar em "Entrar" ou "Criar conta". A rota
  `/login` continua existindo (link de recuperação de senha, sessão
  expirada). Adicionado campo de confirmação de senha no cadastro (não
  existia).
- **Banner de trial expandido**: antes só avisava nos últimos 5 dias; agora
  mostra "você está no teste — N dias restantes" com botão "Ativar
  assinatura" durante todo o trial, escalando pra tom de urgência nos
  últimos 5 dias.
- Landing: textos da seção de benefícios reescritos (tom de automação/
  praticidade); "Seus dados são seus" (confuso, parecia a feature de
  exportação) virou "Seus dados, protegidos" (segurança); hero focado em
  "sozinho, em casal ou com toda a família" em vez de só família.

**Bug real encontrado e corrigido nesta sessão**: o modal de login/cadastro
expôs uma condição de corrida que já existia em `AuthContext` — ao criar
conta, o Firebase autentica antes do backend terminar de criar o perfil e a
família; nesse intervalo, `user` já é truthy (objeto mínimo, sem `id`). A
`LandingPage` redirecionava pra `/dashboard` em qualquer `user` truthy, então
o Dashboard montava e buscava dados antes da família existir, ficando preso
carregando pra sempre (a `LoginPage` antiga não tinha esse guard, por isso
nunca pegou esse bug). Corrigido checando `user?.id` em vez de `user`.

**Limpeza de dados**: apagadas as duas famílias de teste que já estavam
pendentes (`TESTUSER587309038995717462`, `TESTUSER8066625080459611528`) e
as três famílias de teste criadas durante os testes desta sessão — todas via
`tools/apagar-familia.js`, backup tirado antes. Telefone do "Johnny" (família
do Deryck) conferido: o campo `phone` já está correto (alguém já editou pelo
painel); só o ID interno do documento ainda carrega o número antigo — sem
efeito funcional, porque tanto a atribuição de gasto quanto a sincronização
de membros casam pelo campo `phone`, não pelo ID. Migrar o ID exigiria
apagar/recriar dado de cliente real sem ganho nenhum — não mexido.

## Sessão de 08/08/2026 — reescrita de conteúdo da landing page

Todo o texto da landing (`frontend/src/pages/LandingPage.jsx`) foi reescrito
a pedido do Kirk: a copy anterior era genérica/publicitária ("Nada de
instalar nada", "Você já vive no WhatsApp") e não explicava o produto. Nova
estrutura, 11 seções + FAQ, todas seguindo a mesma lógica (mensagem no
WhatsApp → RevelaCash registra → dado organizado no painel), sem prometer
resultado financeiro nem parecer banco/conta digital/carteira. Toda
funcionalidade citada existe de verdade no sistema — nada foi inventado.
FAQ implementado com `<details>/<summary>` nativos (sem dependência nova).
Testado no navegador seção por seção, incluindo abertura do FAQ e âncoras
do rodapé (Como funciona/Preço/Dúvidas). Build limpo.

## Sessão de 08/08/2026 (parte 3) — identidade visual definitiva

Kirk entregou o mockup final da marca (5 PNGs 3D render, ~5,5 MB cada, fundo
cinza-claro). Processados com Python/Pillow (`ImageDraw.floodfill` a partir
de várias sementes nas bordas, threshold alto pra engolir a sombra suave do
render — um threshold baixo deixava a sombra como um halo cinza opaco) e
convertidos pra WebP (ex.: 600 KB → 28 KB, mesma imagem). Fonte crua fica em
`frontend/public/brand/source/` (gitignored, 28 MB); os assets usados pelo
site são os `.webp`/`.png` processados na raiz de `frontend/public/brand/`.

Cor da marca extraída por amostragem de pixel do wordmark (texto plano, sem
sombreamento 3D — mais fiel que amostrar o ícone com iluminação):
roxo `#442477` → família `brand` recalculada (`DEFAULT #512b8d`,
`dark #3f216e`); verde `#2dbe79` → família nova `accent` (`DEFAULT #2dbe79`,
`dark #1b734a`). Atualizado nos três arquivos-fonte que precisam ficar
idênticos: `tailwind.config.js`, `tokens.css`, `tokens.js`. Como
`.btn-primary` e quase todo componente já usavam `bg-brand`/`text-brand-dark`
etc. (tokens, não hex cru), a cor nova se propagou pro app inteiro sem
precisar editar tela por tela — só 4 lugares tinham hex antigo hardcoded
fora do sistema de tokens (`TourContext.jsx`, `MonthlyReport.css`,
2× `LandingPage.jsx`), corrigidos à parte.

`Logo.jsx` trocou a letra "R" provisória pelo ícone de verdade
(`icon-color-256.webp`) e o wordmark "Cash" passou a usar `text-accent`
(verde) em vez de `text-brand` — igual ao mockup. Favicon trocado de SVG
provisório pros PNGs do ícone (`icon-square-dark-32/180.png`).

Marca d'água adicionada no hero (ícone colorido, opacidade 0.10) e na seção
escura de preço (ícone branco gerado a partir do canal alfa, opacidade
0.05). **Armadilha nova**: `position: relative` sozinho não cria contexto de
empilhamento — só com `z-index` explícito também. Sem isso, `-z-10` do
elemento filho escapa pra trás da página inteira (atrás do `bg-bg` do body),
ficando invisível mesmo com opacidade alta. Correção: `relative z-0` (não só
`relative`) nas duas seções com marca d'água. Descoberto comparando hash MD5
de screenshots — duas capturas em opacidades diferentes deram o mesmo
arquivo, provando que nada estava sendo pintado.

Toque de duas cores (roxo/verde alternado, refletindo o próprio ícone) nos
badges "01/02/03" de Como Funciona e nos 3 cartões Individual/Casal/Família.

Pré-visualização de link (WhatsApp etc.) implementada do zero — não existia
`og:image` nenhuma, por isso o preview aparecia sem miniatura. Card com o
ícone centralizado num fundo claro (`frontend/public/brand/og-image.jpg`,
1200×1200, quadrado — cards compactos cortam banners largos no meio e
perdiam o ícone) e descrição reescrita: a antiga ("lance gastos no WhatsApp
da família") soava como se o sistema funcionasse dentro de um grupo que a
família já tem. Nova: "Lance gastos e receitas no WhatsApp, sozinho ou em
grupo de até 8 pessoas, e veja para onde vai seu dinheiro." (109 caracteres,
cabe sem cortar na maioria dos clientes).

Testado com build de produção limpo e Playwright/agent-browser local (hero,
seção de preço, modal de cadastro, seção "como funciona", seção
individual/casal/família) — nada em produção ainda, fica pro Kirk revisar e
autorizar o push (frontend = deploy automático).

## Sessão de 07/08/2026 (parte 4) — pré-visualização colorida e log duplicado no WhatsApp

Dois ajustes pequenos, ambos testados (`npm run build` limpo) e publicados
(push = deploy automático do frontend).

**Card de compartilhamento (og:image) trocado pro ícone colorido.** Kirk
testou o link no WhatsApp com outro número — a prévia (favicon, título,
descrição) funcionou — e pediu a versão roxo/verde no lugar da versão escura
usada antes. Novo arquivo `frontend/public/brand/og-image-color.jpg`
(1200×1200, mesmo formato quadrado, ícone sobre fundo claro com sombra suave
gerada por script); `og:image`/`twitter:image` no `index.html` apontados pra
ele. Commit `96b9e39`.

Armadilha ao gerar a sombra: um `GaussianBlur` aplicado numa camada do
**mesmo tamanho** da elipse corta o desfoque na borda do canvas, sobrando um
retângulo cinza sólido em vez de sombra suave. Precisa de uma camada bem
maior que a elipse (padding de várias vezes o raio do blur) para o
desfoque ter espaço de esvanecer até transparente antes de bater na borda.

**Log do WhatsApp mostrando lançamento "duplicado".** Não era duplicado de
verdade: toda confirmação que o sistema manda de volta pro WhatsApp (barreira
anti-loop, ver `respostaWhatsapp.js`) também grava um `whatsappLogs` com
`sender: 'sistema'` e `processingStatus: 'BOT'` — proposital, é o que permite
`jaProcessada()` reconhecer a própria mensagem do bot. A tela
(`WhatsappLogsPage.jsx`) não conhecia esse status, caía no fallback
`STATUS_CONFIG.PENDING` e mostrava como um segundo lançamento "Pendente" ao
lado do real "Processado". Corrigido: rótulo próprio ("Confirmação
enviada") e oculto da lista por padrão, igual já acontecia com `CANCELLED`.
Commit `c0fc8fe`.

## Decisões já tomadas (não reabrir sem motivo)

| Tema | Decisão | Por quê |
|---|---|---|
| Canal WhatsApp | **Adapter**: Evolution agora, Cloud API oficial depois | Lança rápido sem ficar preso; a Groups API oficial (aberta jun/2026) permite 8 participantes por grupo e 10.000 grupos por número, e o fluxo recebe→confirma custa R$ 0,00. Depende da OBA — verificação de negócio (CNPJ) + 30 dias na Cloud API, **gratuita**, não é a mesma coisa que a assinatura paga Meta Verified (corrigido em 10/08/2026) |
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

**Fase 4 — orçamento, recorrência, fatura e mídia** (no ar desde 08/08/2026)
- Orçamento mensal por categoria com alerta de estouro no painel (`/orcamento`)
- Contas fixas recorrentes lançadas sozinhas por job diário (`/contas-recorrentes`)
- Fatura de cartão de crédito com fechamento/vencimento e histórico (`/faturas`)
- Áudio transcrito e foto de cupom via Gemini, reaproveitando o parser de texto
- Ver sessão de 08/08/2026 (parte 4) para o detalhe de cada peça, e parte 5
  para as correções (modelo do Gemini, botões do painel) e o que ainda não
  foi verificado (mídia contra o servidor real de WhatsApp)

**Painel gestor / portal do operador** (no ar desde 08/08/2026, refeito na parte 5)
- `/plataforma` — login próprio (usuário `kirkdouglas_19`, ver
  `tools/criar-login-operador.js`), sem relação com nenhuma conta de
  família. Drill-down por família, pagamento manual, marcar/desmarcar
  cortesia, sincronizar, cancelar, bloquear/desbloquear acesso — tudo
  auditado em `adminAuditLog` e testado botão por botão

**Fase 5 — cobrança, LGPD e operação** (no ar desde 06/08/2026)

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

**Fase 5.1 — conta, canal e onboarding** (no ar desde 06/08/2026)

Sem isto a Fase 5 não vendia nada: não existia cadastro, e o canal exigia que o
cliente tivesse VPS própria.

Conta
- **Cadastro** na tela de login (não existia; `createUserWithEmailAndPassword`
  não era chamado em lugar nenhum e só havia usuários criados à mão no console).
  Pede nome, e-mail, **WhatsApp** e aceite dos termos
- Falha no meio apaga o login recém-criado — login órfão deixaria o e-mail como
  "já em uso" sem conta utilizável
- Aceite gravado com data e versão (`termsAcceptedAt`, `termsVersion`)
- Recuperação de senha por e-mail; resposta igual exista ou não a conta, para
  não virar sonda de lista de clientes

Canal WhatsApp — o cliente não informa mais nada de infraestrutura
- `src/config/evolutionServidor.js`: URL e API key são do OPERADOR, vindas de
  `EVOLUTION_SERVER_URL` e do secret `EVOLUTION_API_KEY`. `configEfetiva()`
  resolve por família, com precedência para credencial própria (a do Kirk, que
  roda em instância criada à mão antes disto)
- Uma instância por família, criada pelo sistema, com o webhook já apontado
- **Modo de uso escolhido primeiro**: `individual` (lança na auto-conversa) ou
  `grupo` (o sistema cria o grupo). No individual, só a auto-conversa é aceita —
  sem isso um amigo mandando "te devo 50" viraria despesa
- No grupo, os participantes são cadastrados ANTES do QR; o grupo nasce pronto
  quando o WhatsApp conecta. O WhatsApp não cria grupo vazio
- Quem entra no grupo vira membro autorizado pelo telefone, até 8 por família.
  Não precisa de login para lançar
- Conexão por **QR** ou por **código de pareamento**. O método é escolhido antes
  de criar a instância porque o Baileys recusa pareamento em sessão que já
  emitiu QR (`qrcode: false` na criação é o que faz o código valer)

Validação
- `src/utils/telefoneBR.js`: DDD da lista oficial, 9 obrigatório, 11 dígitos.
  Fixo recusado. Roda no backend (fonte da verdade) e no frontend (máscara)

Testes: 92 → 246.

## Verificado em produção nesta sessão

| O quê | Como |
|---|---|
| Webhook do Mercado Pago | HMAC conferido em produção; simulação do painel passou |
| Criação de preapproval | `id=60d6522d…`, R$ 24,90, `external_reference` correto |
| Provisionamento de instância | criada, webhook apontado, QR devolvido |
| Cadastro → família → trial | conta nova nasce com 14 dias |
| Isolamento entre famílias | 5 famílias, dados não se cruzam |
| **Lançamento em grupo, 2 pessoas** | **passou** — era o objetivo do produto |

Não verificado: transição `pending → active` do Mercado Pago (depende de cartão
real no checkout) e o código de pareamento contra um celular de verdade.

## Configuração já feita (não repetir)

Tudo abaixo está no ar e funcionando:

| Item | Estado |
|---|---|
| Aplicação no Mercado Pago | "SistemaFinancas", solução **Assinaturas** |
| `MERCADOPAGO_ACCESS_TOKEN` | credencial de **TESTE** |
| `MERCADOPAGO_WEBHOOK_SECRET` | modo de teste, HMAC verificado em produção |
| Webhook no painel do MP | URL cadastrada, evento "Planos e assinaturas" |
| `EVOLUTION_API_KEY` | secret, chave global do servidor Hostinger |
| `EVOLUTION_SERVER_URL` | `.env.financeiropessoal-29b32` |
| `ADMIN_EMAILS`, `APP_URL` | idem, domínio `financeiropessoal-tau.vercel.app` |

Conta interna: a família do Kirk é `plan: 'interno'`, `priceCents: 0`. Entra em
"ativas" e "internas", nunca em pagantes, MRR, churn ou conversão.

```bash
node tools/diagnostico-assinatura.js          # quem seria bloqueado hoje
node tools/testar-credencial-mp.js            # valida token, sem imprimir
node tools/testar-assinatura-ponta-a-ponta.js <id>
node tools/testar-canal-ponta-a-ponta.js <id> --manter
node tools/marcar-conta-interna.js <id> --confirmar
node tools/apagar-familia.js <id> --confirmar # limpa conta de teste
```

Todos carregam `.env` e segredos sozinhos (`tools/carregarAmbiente.js`).

## Para vender de verdade, falta

1. ~~Trocar `MERCADOPAGO_ACCESS_TOKEN` pela credencial de **produção**~~ feito 08/08/2026
2. ~~Cadastrar o webhook também na aba **Modo de produção** do MP e gravar o
   segredo de lá~~ feito 08/08/2026
3. Fazer uma assinatura real e conferir a transição `pending → active`

## Falta

**Parser** — `Pagamento cartão 1830` corrigido em 07/08, deployado. `Lanche
38,00 crédito` continua caindo na IA por decisão consciente — "lanche" é
categoria, não tipo, e virar palavra-chave de tipo abriria precedente pra
qualquer substantivo de compra.

**Convite de membro com login próprio**
- Quem entra pelo grupo lança pelo WhatsApp, mas não abre o painel. O
  `authService.createOrUpdateProfile` cria uma família NOVA para quem se
  cadastra, então hoje um segundo login vira outra família (e outra cobrança).
  Falta o fluxo de convite ligando conta ao membro já existente

**Tutorial de primeiro uso** — o Kirk pediu para deixar por último

**Fase 6 — landing page**
- Estrutura, copy, preço e mini-recriação do dashboard prontos (07/08), em
  produção em `/`. Falta: prints reais do sistema (a mini-recriação usa os
  mesmos tokens mas não é screenshot) e fotos de pessoas reais — decisão e
  fonte do Kirk, banco licenciado ou fotos próprias
- Detalhe técnico: página publicada bloqueia recurso externo — imagens
  precisam ir embutidas (data URI)

## Decisão revista: 1:1 vs grupo (pesquisado em 06/08/2026)

O Kirk perguntou se conversa individual com um número do sistema não seria
melhor que grupo. Pesquisado e decidido **manter grupo**, porque o objetivo do
produto é a visão compartilhada — marido e mulher verem o gasto um do outro.

Fatos apurados, para não repesquisar:
- Resposta dentro da janela de 24h é **grátis, sem teto**, em 1:1 e em grupo.
  Custo não é critério de escolha
- O limite de 250 contatos/dia **não se aplica**: só vale para mensagem
  iniciada pelo negócio fora da janela
- Groups API oficial exige **Official Business Account** (verificação de
  negócio + 30 dias na Cloud API, gratuita — não é a assinatura paga Meta
  Verified, os dois caminhos são diferentes); 1:1 não exige nada disso
- **Grupo não suporta botões nem listas interativas.** Limita confirmação do
  tipo "está certo? [Sim] [Corrigir]"
- Groups API: 8 participantes por grupo, 10.000 grupos por número

## Pendências operacionais do Kirk

- Migrar pro canal oficial: registrar número dedicado do operador na Cloud
  API (Meta for Developers), passar pela verificação de negócio da Lion
  Tech, esperar 30 dias na plataforma, então pedir a Official Business
  Account (gratuita) — libera a Groups API. Detalhe do passo a passo na
  sessão de 10/08/2026

Resolvidos nesta sessão (não repetir): telefone do Johnny conferido (campo
`phone` já correto), vault Obsidian atualizado (`projetos/financeiro.md` e
`sistema/painel.md` já refletem "em-execução"/NO AR), famílias de teste
`TESTUSER587309038995717462` e `TESTUSER8066625080459611528` apagadas.

## Dívidas conhecidas

- `README.md` descreve stack que não existe mais (PostgreSQL/Prisma)
- Pasta `backend/` é legado morto
- ~~Rate limit é em memória, portanto por instância — segura flood trivial,
  não ataque distribuído. App Check resolveria~~ **App Check no ar desde
  10/08/2026** (`APP_CHECK_ENFORCE=true`, ver sessão 09-10/08). Resolve o
  cenário de script direto contra o endpoint. O rate limit por IP em si
  continua em memória (limitação aceita, documentada no próprio código) —
  ganhou um complemento por família (`limiteMensagensService.js`, 40/min),
  mas ainda não é distribuído entre instâncias
- `cloudApiProvider.js` está escrito conforme a documentação mas **nunca foi
  exercitado contra a API real**. Tratar como não verificado
- Bundle do frontend em ~1,35 MB (cresceu com Firebase App Check/reCAPTCHA),
  sem code splitting
- Zero testes no frontend (backend tem 320)
- `/admin/metricas` lê todos os households a cada chamada. Serve de sobra para
  dezenas ou centenas de famílias; passa a doer nos milhares
- Uma instância Evolution por família consome recursos da VPS. Dezenas de
  clientes cabem; centenas precisam de medição antes

## Armadilhas descobertas nesta sessão

Custaram horas. Estão nos comentários do código, repetidas aqui:

- **Baileys recusa pareamento em sessão que já emitiu QR.** Criar a instância
  com `qrcode: false` é o que faz o código de 8 dígitos valer
- **O painel do Mercado Pago confere a URL do webhook com GET** antes de
  salvar. Endpoint só com POST devolve 404 e o painel recusa com erro genérico
- **`POST /preapproval` responde 500 com `payer_email` em `@testuser.com`.**
  Mesmo payload com e-mail comum funciona
- **Autorizar assinatura por API dá 404 `Card token service not found`**: o
  token de cartão precisa vir da chave pública no navegador
- **Public Key e Access Token de teste ambos começam com `TEST-`.** A Public
  Key é um UUID; o Access Token não
- **Zod com `.default()` inventa valor em corpo que não menciona o campo.** Foi
  assim que "salvar a mensagem de confirmação" desligou o canal de um cliente
