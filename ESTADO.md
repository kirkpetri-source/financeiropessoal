# Estado do projeto — 20/08/2026 (backend completo em produção, frontend pendente)

Transformação de sistema pessoal em micro-SaaS a R$ 24,90/mês.

## RETOMAR AQUI — falta a Fase 4 e publicar o frontend (20/08/2026)

### O que está NO AR

**Backend em PRODUÇÃO**, com tudo desta sessão. Assistente liberada só para a
Família Vinicius (`ASSISTENTE_FAMILIAS=bgo6KJKTgCqC1HN2Jqzh`) — conferido após
o deploy: **1 família com assistente, 12 intocadas**.

**Frontend NÃO está em produção.** `main` não tem a tela da assistente nem o
menu condicional. A branch `feature/chat-ia` está ~45 commits à frente.
Testado local contra homologação e aprovado pelo Kirk.

### O PRÓXIMO PASSO — decisão do Kirk

**Publicar o frontend** (`git push origin main`). Está pronto e testado, mas
não foi feito porque **push para `main` é deploy de produção na hora** para as
13 famílias, e isso precisa de autorização explícita.

Quando publicar, o painel ganha a aba "Assistente" — e ela **só aparece para
quem tem acesso liberado** (o menu pergunta `GET /assistente/uso` e obedece).
Para as outras 12 famílias o painel fica idêntico ao que já usam.

### QUANDO FOR LIBERAR PARA TODAS AS FAMÍLIAS — pedido do Kirk

Basta **esvaziar `ASSISTENTE_FAMILIAS`** no `.env` de produção e deployar o
BACKEND. O menu aparece sozinho: o frontend pergunta ao servidor e obedece,
então **não é preciso publicar o site de novo**. Ver regra 18.

Antes de liberar, decidir: a cota diária (hoje 20 conversas) e se troca o
modelo (ver "Custo").

### O que a assistente faz hoje

| | painel | WhatsApp |
|---|---|---|
| consultar gastos | sim, **sem IA** | sim, **sem IA** |
| relatório por pessoa (mês/semana/dia) | sim, sem IA | sim, sem IA |
| conselho | sim | sim |
| lançar | sim | sim |
| alterar/apagar (2 etapas) | sim | sim |
| **cadastrar conta fixa** | sim | sim |
| perguntar por **áudio** | — | sim |
| foto de cupom | — | sim (lança) |

### Trabalho desta sessão (20/08)

**Camada de consulta SEM IA.** Consulta não passa pelo modelo: o número sai
das mesmas agregações que a IA usaria. Custo zero, resposta em menos de 1s,
número exato. 80% das perguntas reais respondidas assim. **Não consome cota.**

**Relatório por pessoa** (`gastoPorPessoa`) com recorte em dias no fuso do
Brasil, sem o teto de 40 lançamentos que fazia a soma sair menor que a real.

**Lançamento em subcategoria** — bug relatado por usuários. "gastei 45 na
padaria" caía em Alimentação. Agora vai para Mercado > Padaria e a confirmação
diz isso.

**Criar subcategoria sob demanda.** Na 2ª vez que uma descrição se repete, a
Nina oferece criar. A memória guarda o vínculo, então o 3º lançamento vai
direto. "não" cala a sugestão para sempre.

**Fase 3 — áudio.** Perguntar por áudio funciona: é transcrito e passa pelo
MESMO roteador do texto. A transcrição fica no log e é reaproveitada.

**Conta fixa pela conversa.** A Nina cadastra contas fixas recorrentes — antes
mandava o cliente abrir o painel.

**Menu condicional** no painel.

### Bugs corrigidos (todos com teste que os prende)

1. Confirmação omitia a subcategoria — registrava certo e informava errado.
2. Comparativo comparava um mês com ele mesmo. Corrigido no roteador e **o
   executor continuou descartando o `mesA`** — "compare com junho" comparava
   julho com agosto em silêncio.
3. **Pergunta sobre OUTRA família virava o total da família logada.** "e quanto
   a família do Vinicius gastou?" respondeu os números da casa, sem ressalva e
   sem passar pela IA. A defesa agora é invertida: o resumo só responde quando
   reconhece TODAS as palavras da frase.
4. **Pedido de conta fixa virava lançamento** quando faltava o nome da Nina —
   criava despesa fantasma e nenhuma conta fixa.
5. Consulta sobre cripto virava sermão (a regra disparava na palavra).
6. "Sim"/"Confirmo" caíam no vazio.
7. Vocativo com pontuação/saudação antes.

### Custo — medido

| | `gemini-3.6-flash` (atual) | `gemini-3.5-flash-lite` |
|---|---|---|
| por pergunta | R$ 0,0453 | R$ 0,0123 |
| 20/dia (teto) | R$ 27,19/mês = 109% da mensalidade | R$ 7,37 = 30% |

**Cache do Gemini não funciona com function calling** (medido 0%). 96,5% do
que se paga é estrutura fixa do prompt reenviada a cada rodada — por isso a
camada sem IA é a alavanca certa, e ela já corta 80% do volume.

**BYOK recusado:** free tier do Gemini TREINA com os dados, e os termos avisam
contra dado financeiro. Alternativas medidas: Groq e DeepSeek ~24x mais
baratos que o atual.

### Varredura de segurança (20/08)

Nada crítico. Nenhuma rota sem autenticação, nenhum segredo rastreado,
isolamento com 16 testes, sem ciclos. **8 vulnerabilidades moderadas = 1 real**
(`uuid`, transitiva do firebase-admin, não exercitada aqui). Corrigir exige
firebase-admin 12→14 (breaking) — **decisão: não mexer agora**.

### PENDÊNCIAS

1. **Publicar o frontend** (`main`) — pronto e testado, falta a autorização.
2. **Fase 4** — nada começou: `/ajuda`, termos com aviso de persona de IA,
   privacidade (dados agregados no Gemini), landing, mensagem de apresentação.
3. **`memoriaDeDescricaoService` sem teste de unidade.**
4. **Decidir cota e modelo** antes de liberar para todos.
5. **4 famílias com trial vencido**: Weider e Aline, Lucas, Raquel, claudio.
6. Corrida entre `jaProcessada()` e a gravação: real, nunca observada.

### Como testar

```bash
# painel local contra HOMOLOGAÇÃO (produção bloqueia por CORS + App Check)
cd frontend && npm run dev -- --mode staging --port 5173 --strictPort
#   teste@revelacash.invalid / teste-da-nina-123
```

```bash
node tools/acompanhar-whatsapp.js <id>                    # assiste ao teste ao vivo
node tools/zerar-limite-do-dia.js <id> --confirmar        # destrava a cota
ALVO=staging node tools/testar-consulta-direta.js         # 21
ALVO=staging node tools/testar-conta-fixa-assistente.js   # 15
ALVO=staging node tools/testar-audio-assistente.js        # 14
ALVO=staging node tools/testar-criar-subcategoria.js      # 17
ALVO=staging node tools/testar-webhook-ponta-a-ponta.js   # 18
ALVO=staging node tools/testar-roteador-whatsapp.js       # 17
ALVO=staging node tools/medir-custo-assistente.js         # custo real
```

**941 testes de unidade** + 102 verificações de ponta a ponta.

---

## Sessão de 18/08/2026 — assistente de IA (Nina), primeira versão

Branch: **`feature/chat-ia`**, 18 commits, **nada em `main`** (o frontend não
foi publicado). O BACKEND está em produção, com a assistente liberada só para
a família de teste.

### O que já está pronto e funcionando

**Fase 1 — motor e painel (completa).**
- `consultaFinanceiraService` — 10 ferramentas de leitura. Nenhuma aceita
  `householdId`: ele vem preso no escopo antes de a IA existir na conversa
- `acoesFinanceirasService` — registrar (delega para `lancarPorTexto`, o
  caminho do WhatsApp que já existia), alterar e apagar em DUAS ETAPAS, com a
  proposta gravada no servidor
- `chatIAService` — orquestrador, prompt, catálogo filtrado por papel
- `chatSessionService` — memória por família **e interlocutor**
- `limiteChatService` — 20 conversas/dia, contador separado do de lançamento
- `assistenteService` — fachada + interruptor + liberação por família
- Rota `/assistente` e página `/assistente` no painel (layout de coluna única,
  com "ver de onde veio" abrindo as consultas usadas)

**Fase 2 — WhatsApp (quase completa).**
- Nome da assistente com validação (entra no prompt: nome mal formado é
  injeção) e casamento tolerante a erro de transcrição
- Classificação de intenção reusando a chamada de IA que já acontecia
- Roteador (`utils/roteadorMensagem.js`), a peça de maior risco
- Mensagens de limite com data e hora do retorno

### Estado em PRODUÇÃO

Backend deployado. `ASSISTENTE_FAMILIAS=bgo6KJKTgCqC1HN2Jqzh` — só a **Família
Vinicius** (conta de teste do Kirk, `liontech.sup@gmail.com`, dados fictícios,
canal pareado) enxerga a assistente. As outras 12 famílias seguem exatamente
como antes; verificado família por família depois do deploy.

Desligar tudo sem deploy: `ASSISTENTE_ATIVA=false`.

### Teste ao vivo pelo WhatsApp — 3 falhas achadas e corrigidas

O Kirk testou de verdade pelo WhatsApp da Lion Tech. **Nenhuma das três falhas
tinha sido pega pelos 810 testes automatizados** — todas moram na borda entre o
WhatsApp real e o sistema.

1. **Pergunta sem o nome era descartada em silêncio, sem virar log.**
   `looksLikeFinancialMessage` responde NÃO para toda pergunta (procura valor).
   Eu o havia deixado antes da classificação. "Nina quanto gastei" funcionava
   (o nome resolve antes) e mascarou o problema.

2. **Resposta chegou cortada no meio da frase, duas vezes.** Causa: o
   `maxOutputTokens` do Gemini 3.x inclui os tokens de raciocínio — ver
   armadilha nova no `CLAUDE.md`. Meu "conserto" anterior (baixar o teto para
   400 no WhatsApp, para ganhar tempo) tinha PIORADO isso.

3. **Conversa morria em "não consegui fechar uma resposta"** sempre que a
   pergunta precisava de duas consultas. Bug no laço: o pedido de fechamento
   era montado e nunca enviado.

Depois da segunda correção, uma quarta falha do mesmo tipo: "Detalhe os gastos
d moradia" também sumiu, porque minha correção usou **lista fechada de
palavras** ("quanto", "quais", "como") e "detalhe" não estava nela. Invertido:
agora passa tudo menos conversa fiada.

### Sessão de 19/08/2026 — duplicidade resolvida, custo medido, chave vazando

**1. A duplicidade era outra coisa — o diagnóstico anterior estava errado.**

A pendência dizia "janela de corrida entre `jaProcessada()` e a criação do
log", com a correção prescrita sendo `criarComId(messageId)` (regra 15).
`tools/diagnostico-duplicidade-whatsapp.js` (só leitura) foi lido contra a
produção antes de mexer em qualquer coisa, e a conta deu outra:

```
  fallback do roteador (1 com payload + 1 sem): 12
  reentrega/corrida (todos com payload):         0
```

**12 de 12, zero corridas.** As duas causas têm assinaturas diferentes no
banco e dá para separá-las: o log do webhook guarda `rawPayload`, o log que
`conversarComAssistente` abria não guardava. Todos os pares eram um de cada.

A causa real: pergunta que chega SEM o nome da assistente percorre o caminho
de fallback — o webhook grava o log, `lancarPorTexto` tenta interpretar como
lançamento, a IA responde "era PERGUNTA", e aí `conversarComAssistente` abria
um SEGUNDO log da mesma mensagem. Corrigido reaproveitando o log existente
(`logExistente`). Pergunta com o nome nunca duplicou — vai direto ao chat.

Se a correção prescrita tivesse sido aplicada sem conferir, ela teria
quebrado: a segunda criação bateria em `criado: false` e o caminho de
fallback precisaria de tratamento novo. Consertar a causa errada custa duas
vezes.

**Sobre "IA paga em dobro": era menos grave do que estava escrito.** Não são
duas conversas cobradas — é UMA chamada extra do parser, que toda pergunta
sem o nome paga para o sistema descobrir que era pergunta. Isso é o desenho,
não um bug: pular essa chamada exigiria decidir "é pergunta" antes da IA, e
foi justamente o que a regra 3 do roteador protege (mensagem que o parser
entende nunca chega perto da assistente). O que era bug foi só o log dobrado.

**2. Custo real, medido — a estimativa errou nos DOIS sentidos.**

`tools/medir-custo-assistente.js` roda 5 perguntas reais (as do teste ao vivo
do Kirk, não perguntas de vitrine) contra o Gemini de verdade em homologação.
`chatIAService` agora soma os tokens de todas as rodadas e registra o custo em
reais no log; `aiParserService` faz o mesmo. Antes disso nenhuma chamada de IA
do projeto reportava consumo — qualquer número de custo era chute.

| | estimado no desenho | medido |
|---|---|---|
| custo por pergunta | R$ 0,03 | **R$ 0,0177** |
| tokens de entrada | não estimado | **7.628** (média) |
| tokens de saída | ~700 (só raciocínio) | **393**, dos quais 258 de raciocínio |
| chamadas ao modelo | 1 | **2,8** |

O medo registrado ("pode estar 4 a 6 vezes acima") **não se confirmou** — o
custo por pergunta é menor que a estimativa. Mas a estrutura do custo estava
toda errada:

- **O peso está na ENTRADA, não no raciocínio.** São 7.628 tokens de entrada
  contra 393 de saída. Cada rodada reenvia a conversa inteira + o catálogo de
  ferramentas + o vocabulário da família, então a entrada cresce a cada volta.
  Entrada é 8x mais barata por token, o que salva a conta — mas é ela o
  volume. Se algum dia for preciso cortar custo, é aí que se mexe (encolher o
  catálogo/vocabulário), não no teto de saída.
- **O raciocínio variou de 0 a 665 tokens** por chamada, não os ~700 fixos que
  a armadilha registrava. Consulta simples pensa pouco; conselho pensa muito.

**Cota de 20/dia: cabe, com folga menor do que parece.** No teto absoluto dá
R$ 10,60/mês por família = **43% da mensalidade de R$ 24,90**. É viável mas
apertado se alguém usar o limite todo dia. No uso realista (3 perguntas/dia)
são R$ 1,59/mês, ou 6% da mensalidade. **Decisão do Kirk:** manter 20/dia
(ninguém chega perto) ou baixar para ~10 para garantir a margem.

**3. Primeiro teste automatizado do webhook.**

`tools/testar-webhook-ponta-a-ponta.js` — 12 verificações, todas verdes.
O webhook não tinha NENHUM teste e não pode ter em vitest: importa
`whatsappLogService`, que importa `firebaseAdmin` no topo, e a trava da regra
2 derruba a suíte. Era essa lacuna que deixava as falhas escaparem dos 810
testes verdes — as quatro do teste ao vivo moravam todas ali.

Cobre: o bug corrigido (pergunta sem nome grava UM log), o caminho direto,
lançamento que não pode regredir (`gastei 37,50 no mercado` vira transação de
R$ 37,50), deduplicação no reenvio e conversa fiada ignorada.

**4. A chave de produção estava sendo empacotada no deploy.**

`firebase.json` não tinha lista de `ignore` e não existe `.gcloudignore`,
então o pacote levava tudo de `functions/` — inclusive
`serviceAccountKey.json`, a chave privada de produção. A function de
**homologação subia com a credencial de produção dentro do container**.

Não era explorada pelo código (`firebaseAdmin` só lê o arquivo quando
`NODE_ENV != production`, e em Cloud Functions é sempre `production`), mas a
chave estava lá — num projeto com acesso mais frouxo por ser o ambiente de
teste. Quem lesse aquele container teria leitura e escrita no Firestore das
13 famílias pagantes.

Corrigido com `ignore` no `firebase.json`. O pacote caiu de 474,74 KB para
347,35 KB — a diferença é a prova de que ia junto. Homologação redeployada e
`/health` respondendo 200.

### PENDÊNCIAS — o que fazer ao retomar

1. **Kirk decide sobre a cota diária** (hoje 20/dia = 43% da mensalidade no
   teto). Manter ou baixar para ~10.

2. **Subir para produção.** Homologação já está no ar com tudo isto. As
   correções são de bug em código que JÁ está em produção — falta só o
   `firebase deploy --only functions:api --project prod`.

3. **Continuar o teste ao vivo** pelo WhatsApp (Família Vinicius).

4. **Corrida entre `jaProcessada()` e a gravação: real, mas nunca observada.**
   Zero ocorrências nos 96 registros lidos. A trava do banco
   (`criarComId(messageId)`) continua sendo a correção certa SE ela aparecer,
   e o caminho da assistente aumenta a janela (4 a 8s de processamento contra
   menos de 1s do lançamento). Mudar o ID dos documentos de `whatsappLogs`
   mexe em coleção com dado de produção, então fica como decisão do Kirk, não
   como conserto preventivo silencioso.

5. Fase 3 (áudio nos dois canais) e Fase 4 (central de ajuda `/ajuda`, landing,
   termos com aviso de persona de IA) — nenhuma começou.

### Achados de manutenção (não relacionados à feature)

- ~~**`liontech.sup@gmail.com` está sem `householdId`**~~ — **ERA FALSO,
  conferido em 19/08.** A conta de verdade
  (`ZLnUGkgrAddubKy9szHsbfMBcCF2`) tem `householdId` normal, é `owner` da
  Família Vinicius e entrou no painel em 19/08 às 00:39. O que existe é um
  documento ÓRFÃO em `users/aq64PgkaF3aMbg9ekhETMv90qgu1`, com o mesmo
  e-mail e sem conta no Firebase Auth — sobra de um cadastro anterior
  ("Vinicius Ferreira", 05/08) cuja conta foi apagada. A sessão anterior
  olhou o documento morto e concluiu errado.

  **Não "consertar" escrevendo `householdId` no documento órfão** — ele não
  pertence a ninguém que consiga logar. Existem 3 desses em produção
  (2 de testes antigos, 1 este); são inertes. `tools/diagnostico-conta-sem-familia.js`
  separa os dois casos (é membro de alguma família ou de nenhuma).

- **4 famílias com trial vencido**, reconferido em 19/08 — segue de pé:
  Weider e Aline, Lucas, Raquel, claudio. `tools/diagnostico-assinatura.js`
  diz "seriam bloqueadas: 4". Hoje 9 de 13 ativas, MRR R$ 74,70, 3 pagantes
  e 3 em trial. Decidir: cobrar, estender ou marcar cortesia
  (`tools/marcar-conta-interna.js`).

### Documentos da feature

- Desenho: `docs/superpowers/specs/2026-08-18-consultor-ia-conversacional-design.md`
- Plano: `docs/superpowers/plans/2026-08-18-consultor-ia-implementacao.md`

O desenho inclui a pesquisa de concorrência (Meu Assessor, ZapGastos,
Financinha) e a análise de **Open Finance**: caminho direto exige autorização do
Banco Central (a Lion Tech não se qualifica); via agregador, Pluggy custa
R$ 2.500/mês — oito vezes a receita atual. Recomendação registrada: reabrir com
~150 assinantes pagantes, começando pela TecnoSpeed (R$ 540/mês).

## Sessão de 18/08/2026 — ambiente de homologação

### Bloco 1 — desenho do consultor conversacional (Nina)

Pedido do Kirk: uma IA com quem a família conversa sobre o próprio dinheiro,
por texto e áudio, no painel e no WhatsApp. Não só consulta ("quanto gastei com
mercado esse mês?") — também conselho ("como posso diminuir minhas despesas?")
e execução ("Nina, gastei 84 de gasolina, registra pra mim").

Nada foi implementado. O que existe é desenho aprovado e plano:

- **Desenho**: `docs/superpowers/specs/2026-08-18-consultor-ia-conversacional-design.md`
- **Plano**: `docs/superpowers/plans/2026-08-18-consultor-ia-implementacao.md`

Decisões que valem lembrar (o resto está no desenho):

- **IA com ferramentas, não IA que calcula.** Todo número vem de uma função que
  leu o Firestore. A IA raciocina e aconselha; ela nunca soma.
- **Criar lançamento DELEGA para o fluxo que já existe** (`lancarPorTexto`), em
  vez de gravar por conta própria. Não passa a existir um segundo caminho de
  escrita no sistema.
- **Alterar e apagar sempre confirmam antes.** Criar não precisa — já é assim
  hoje e "apagar ultimo" existe.
- **Nome próprio escolhido pela família** como atalho de invocação, **mais**
  classificação de intenção reusando a chamada de IA que já acontece hoje
  (mensagem que não casa a regra já vai ao Gemini). Funciona com e sem o nome.
- **Só assinante pagante**, cota diária própria (20/dia), separada da de
  lançamento — conversar nunca pode consumir o direito de lançar.

**Pesquisa de concorrência**: o mercado já convergiu para assistente nomeado.
Meu Assessor tem uma equipe de personas (Martin cuida das finanças), ZapGastos
tem o "Leo". Todos têm **Open Finance**, que é a real vantagem deles.

**Open Finance — pesquisado e adiado, com número.** Participar direto exige
autorização do Banco Central (a Lion Tech não se qualifica). Via agregador:
Pluggy R$ 2.500/mês, Belvo R$ 6.000/mês, TecnoSpeed R$ 1.500 + R$ 540/mês. Com
13 famílias a receita é ~R$ 324/mês — o Pluggy custaria **oito vezes a receita
total**. Recomendação registrada: reabrir com **~150 assinantes pagantes**, e
começar pela TecnoSpeed. A importação de extrato já cobre boa parte do valor a
custo zero; a diferença é automação, não capacidade.

**Análise de segurança, seis achados** (detalhe na seção 7 do desenho). Os três
que mais importam:

1. **`householdId` nunca pode ser parâmetro de ferramenta** — é a defesa que
   sustenta o isolamento inteiro. Fechado no escopo antes da IA existir.
2. **O nome da IA vai para dentro do prompt do sistema** — vetor de injeção
   nada óbvio (batizar a IA de "Ignore as instruções acima..."). Exige
   validação estrita.
3. **Um `viewer` poderia escrever pedindo para a IA**, driblando
   `exigir('lancar')`. O catálogo de ferramentas precisa ser filtrado por papel.

**Verificado e resolvido nesta sessão**: o tier da `GEMINI_API_KEY`. A chave em
uso (terminada em `hxhw`, projeto "Financas") está em **billing pago, Nível 1**
— confirmado no painel do AI Studio e por teste de carga (40 chamadas
simultâneas, todas 200; o tier gratuito recusaria a maioria). **Os dados
financeiros dos clientes não são usados para treinar modelos do Google.**

### Bloco 2 — ambiente de homologação (staging)

Motivo, nas palavras do Kirk: "alterações aqui sempre me levam a mexer no
sistema que está em produção, o que me faz ter calafrios... não posso parar o
sistema, temos usuários pagantes ativos".

**Projeto `revelacash-staging` criado e funcionando.** Firestore em
`southamerica-east1` (mesma região da produção), regras e índices deployados,
cinco Cloud Functions no ar, seed rodado. Detalhe operacional completo no
`CLAUDE.md`, seção "Dois ambientes".

**Isolamento provado com números**, não com suposição:

| | Homologação | Produção |
|---|---|---|
| Categorias | 23 (do seed) | 39 |
| Famílias | **0** | **13** |
| Lançamentos | **0** | **355** |

**Bug sério achado antes de causar dano.** Ao conferir para onde o `seed`
apontava, descobri que **todo script de `tools/` falava com produção, sempre** —
projeto fixo no código e `firebaseAdmin.js` usando a credencial de produção
fora do ambiente de Functions. Rodar `npm run seed` achando que ia para o
staging teria escrito no banco dos clientes. Corrigido com `ALVO`, mantendo
produção como padrão (nenhum comando existente mudou), com erro fatal quando a
credencial de staging falta, e com **todo script anunciando em qual banco vai
mexer**, usando o `project_id` lido da credencial de verdade.

**Ganho lateral que encerra a regra 14.** O staging tem `.env` próprio com
`APP_CHECK_ENFORCE=false` **permanente**. Testar local deixa de exigir editar o
arquivo de produção e lembrar de reverter — que foi exatamente como o App Check
ficou desligado em produção por alguns minutos em 11/08/2026.

**Vocabulário combinado com o Kirk**: "sobe para homologação" = staging, "sobe
para produção" = real. Virou a regra 17 do `CLAUDE.md`, junto com a decisão de
que feature nova nasce em homologação — "é aditivo, não quebra nada" deixou de
ser argumento para estrear código em cima de 13 famílias pagantes.

Trabalho na branch `feature/chat-ia`. 539 testes verdes. Nada em produção foi
tocado nesta sessão.

## Sessão de 16/08/2026 — aviso de cadastro no WhatsApp e importação de extrato concluída

### Bloco 1 — aviso de cadastro novo no WhatsApp do operador

Pedido do Kirk: ser avisado no WhatsApp a cada cadastro novo, sem precisar
olhar painel. `notificacaoOperadorService.js` reusa a trilha de envio do bot
(`respostaWhatsapp.responder`), o que traz de graça a assinatura invisível
anti-loop — sem ela a mensagem cairia na auto-conversa e voltaria pelo
webhook como tentativa de lançamento.

Decisões que valem lembrar:
- **Destino é o `ownerJid` (auto-conversa), nunca o grupo**, mesmo com a
  família do Kirk em modo grupo. Cadastro de cliente no grupo da família
  seria vazamento de assunto de negócio para quem não tem nada com isso.
- **Ancorado em `authService.createOrUpdateProfile`**, não em
  `criarHousehold`: só cadastro de cliente de verdade notifica. Script de
  teste e migração criam família sem gerar alerta falso.
- **`await` de propósito** — o Cloud Run congela a CPU quando a resposta HTTP
  sai; disparar sem esperar perderia o envio no meio.
- **Desligado por padrão**: sem `NOTIFICACAO_CADASTRO_HOUSEHOLD_ID` no
  ambiente não notifica nem consulta o Firestore. Configurado com a família
  do Kirk (`4LadYn1k9d5vCVU9K9V7`).
- Conteúdo: **só nome e telefone** (decisão explícita dele — e-mail do
  cliente não vai para o WhatsApp).

Testado ao vivo: envio direto (`tools/testar-notificacao-cadastro.js
--enviar`) e cadastro completo pelo código real, com a família de teste
apagada em seguida. 13 testes novos.

### Bloco 2 — importação de extrato bancário: fechada e publicada

O núcleo de leitura (OFX/CSV, categorizador, agrupador, análise de risco por
mês) tinha sido escrito em 13/08 mas estava **incompleto e sem uso possível**:
não havia rota, tela, persistência nem trava de duplicidade — e nunca tinha
sido publicado. Fechado nesta sessão, com duas exigências do Kirk:
importação **só retroativa** e **impossível gerar lançamento duplicado**.

**Duas barreiras contra duplicidade, uma de produto e uma de banco:**

1. **Janela retroativa** (`importacao/janela.js`): só mês **já fechado**
   entra. O mês corrente — onde os lançamentos por WhatsApp estão
   acontecendo — nem chega a ser oferecido, o que elimina a sobreposição na
   origem em vez de tentar detectá-la depois. Fuso fixo em
   `America/Sao_Paulo`: o Cloud Run roda em UTC e abriria o mês três horas
   cedo, enquanto ele ainda corre para o usuário. Conferida duas vezes, na
   análise e de novo na gravação (um rascunho pode atravessar a virada).
2. **ID determinístico**: o lançamento importado tem como ID a impressão
   digital da linha do banco (`FITID` quando existe, senão hash de
   data+valor+descrição normalizada). Gravar duas vezes é impossível —
   `escopo.criarComId` usa `create()`, que o Firestore recusa se o ID já
   existir. A trava fica no BANCO, não numa conferência da aplicação, que
   teria janela de corrida entre o "já existe?" e o "grava".

Terceira camada, informativa: linha que casa em valor e data com lançamento
que já existe (o que veio pelo WhatsApp não tem digital) aparece marcada e
**desmarcada** na tela. Não trava, porque casamento por valor+data é palpite
— mas deixa o caminho preguiçoso sendo o seguro.

**Tudo aditivo, nada mexido no que já rodava**: rota nova (`/importacao`),
página nova (`/importar`), coleções novas (`importBatches`, `importMemoria`,
já em `escopo.js` e no `lgpdService`), campos novos só nos lançamentos
importados (`digital`, `importId`, `origin: 'IMPORT'`). `transactionService`,
parser, webhook e telas existentes não foram tocados. O único ajuste em
código compartilhado: parser de corpo de 4mb montado **apenas** em
`/importacao` (extrato passa de 1mb), sem mudar o teto das outras rotas.

Desfazer: todo lançamento leva o `importId` do lote; desfazer apaga só o que
aquele lote criou — lançamento manual ou de WhatsApp nunca é tocado.

Portão de assinante: a importação exige assinatura **paga**
(`exigirAssinaturaPaga`) — custa IA em lote e escrita em massa num plano de
preço fixo. Ajuste feito aqui: trial recebe **403 `RECURSO_DE_ASSINANTE`** em
vez de 402, porque o frontend trata 402 como "assinatura inativa" e dispara
alerta global — alarme falso para quem está com o teste em dia.

**Verificação:** 539 testes (28 novos). Teste ponta a ponta contra o
Firestore real (`tools/testar-importacao-ponta-a-ponta.js`, família
descartável criada e apagada): 17/17 — reimportação do mesmo arquivo sem
duplicar, extrato sobreposto trazendo só a linha nova, desfazer preservando
lançamento de outra origem. Depois, **teste visual em produção**
(`revelacash.com.br`, conta de teste marcada como interna, `agent-browser`
headed por causa do reCAPTCHA): upload → preview → importar 8 → reimportar o
mesmo arquivo (0 marcados, tudo "Já importado") → desfazer → 0 lançamentos
restantes. Console limpo. Conta de teste apagada; 10 famílias reais intactas.

**Achado corrigido no teste visual**: `limparDescricao` deixava sobra de
rótulo — "TRANSFERENCIA RECEBIDA PELO PIX - MARIA SOUZA" virava
"- MARIA SOUZA" na descrição gravada, e "COMPRA NO DEBITO" não era
reconhecido (só "COMPRA DEBITO"). Corrigido com 3 testes.

**Sobre o deploy do frontend**: o `git push` disparou o deploy automático do
Vercel, mas ele **demorou alguns minutos para aparecer em `vercel ls`** — o
que na hora pareceu integração desligada e levou a um `vercel deploy --prod`
manual. Os dois deploys entraram, sem prejuízo. Antes de concluir que a
integração não funcionou, esperar e conferir de novo.

## Sessão de 13/08/2026 — CRM do operador, checkout sem conta no MP, núcleo do extrato

Registrado em retrospecto (a sessão não documentou a si mesma). Commits
`07e0ea2`..`b59e9bf`:

- **Painel do operador virou CRM**: dashboard, lista de clientes e central de
  comunicação (`adminCrmService.js`, `adminMensagensService.js`, templates e
  broadcast por segmento, reusando a trilha de envio do bot).
- **Checkout sem exigir conta no Mercado Pago**, redução de gatilhos de
  antifraude (`cc_rejected_high_risk`), limite de 60 caracteres do `reason`, e
  explicação dos passos antes de mandar o cliente para o MP.
- **CSP**: liberado `apis.google.com` (Firebase Auth) e fontes do
  `vercel.live`.
- **Núcleo de leitura de extrato** (OFX/CSV, categorizador com memória da
  família, agrupador, análise de risco por mês) — a parte fechada em 16/08.

## Sessão de 11/08/2026 — subcategorias (painel + WhatsApp), testadas ao vivo e publicadas

Pedido do Kirk: categoria ganhar um segundo nível — subcategorias criadas
pela própria família (ex.: dentro de "Mercado": Padaria, Açougue,
Hortifruti), utilizáveis no painel e pelo WhatsApp. Ao ser perguntado sobre
o escopo do WhatsApp, o Kirk foi explícito: "a IA deve entender a
subcategoria para não errar o lançamento... se ela não entender talvez ela
possa perguntar para que o usuário confirme" — isso definiu o design: nunca
bloqueia o lançamento, tenta identificar sozinha, pergunta quando incerta.

### Bloco 1 — implementação (plano formal, `EnterPlanMode`)

Escopo definido e aprovado antes de codar: subcategoria é sempre da
família (sem versão padrão/global), orçamento/contas fixas continuam só por
categoria-mãe (fora de escopo), parser por regra continua resolvendo só a
categoria-mãe (subcategoria é sempre um passo extra), compra parcelada não
passa pela resolução automática em v1.

**Backend**: `subcategoryService.js` (CRUD, sempre validando posse contra a
categoria-mãe via `dados.buscarDoc`), `transactionService` ganha
`subcategoryId` opcional (validado: precisa pertencer à `categoryId` da
transação), `categoryService.deleteCategory` passa a recusar apagar
categoria com subcategoria pendurada. As três coleções novas
(`subcategories`, `pendingSubcategoryConfirmations`) entraram em
`escopo.js` (`COLECOES_ESCOPADAS`) e em `lgpdService`
(exportar/apagar família) — mesma lacuna já documentada no projeto pra
coleção nova esquecida ali.

**WhatsApp — comando manual**: `subcategoria <nome>` espelha o já existente
`categoria <nome>` (muda a subcategoria do último lançamento, casa por nome
exato, `sem subcategoria` limpa).

**WhatsApp — resolução automática pela IA**: quando a categoria resolvida
(por regra ou por IA) já tem subcategoria cadastrada, uma chamada extra ao
Gemini (`aiParserService.resolverSubcategoria`) tenta escolher pela
descrição. Confiante: aplica direto, sem gerar mensagem — caminho feliz e
silencioso. Incerta: cria uma pendência (`pendingSubcategoryConfirmations`,
single-shot, expira em 15min) e manda uma segunda mensagem perguntando,
numerada. A resposta seguinte (`tentarResolverConfirmacaoPendente`,
checado ANTES de tratar como comando ou lançamento novo) resolve por
número, nome, ou "pular" — e se não bater com nada, descarta a pendência e
segue tratando a mensagem como nova (nunca trava o usuário numa pergunta
velha). Estourar o teto diário de IA nessa chamada extra nunca bloqueia o
lançamento em si, só fica sem subcategoria.

Lógica pura de casamento (`resolverRespostaConfirmacao`,
`montarPerguntaSubcategoria`, `telefoneDe`) extraída pra
`utils/subcategoriaConfirmacao.js` — módulo-folha, testável sem Firestore,
mesmo motivo de `respostaTexto.js` existir separado de
`respostaWhatsapp.js`. Foi necessário: `lancamentoPorMensagem.js` importa
`firebaseAdmin` no topo, e sob teste isso dispara a trava anti-produção
(regra 2) — sem extrair, essa lógica não tinha como ser testada.

**Frontend**: gestão de subcategoria em Categorias (expandir categoria →
criar/editar/apagar) e campo opcional no formulário de lançamento
(reseta ao trocar de categoria — via `onChange` do campo categoria, não
`useEffect`, pra não disparar também quando o modo edição faz `reset()`
dos dois campos juntos).

**Achado na exploração, corrigido junto**: `CategoriesPage.jsx` checava
`disabled={!cat.userId}` nos botões de editar/apagar — campo que nunca
existe no backend atual (categorias padrão têm `userId: null` só no seed;
custom nem têm o campo). Ou seja, **nenhuma categoria podia ser editada
pelo painel**, bug pré-existente sem relação com a tarefa, corrigido pra
`!cat.isDefault` (o campo que o backend realmente usa).

346 testes (336 existentes + 20 novos), suíte inteira verde, incluindo o
teste de dependência circular (a extração pro módulo-folha evitou um ciclo
`comandosWhatsapp` ↔ `lancamentoPorMensagem`).

### Bloco 2 — verificação antes de produção: emulador local, dois bugs de ambiente achados e um corrigido de verdade

Tentativa de testar no navegador local (emulador de Functions + Firestore
de produção real, mesmo padrão de sessões anteriores) esbarrou em dois
problemas do AMBIENTE, não do código:

1. **`express-rate-limit` derrubava toda rota com rate limit** —
   `ERR_ERL_UNDEFINED_IP_ADDRESS`, porque o emulador local não expõe
   `req.ip` do jeito que a lib exige. **Corrigido de verdade** (não é
   workaround): `middlewares/rateLimit.js` ganhou `keyGenerator` próprio
   com fallback. Zero efeito em produção, onde `req.ip` sempre existe
   (atrás do Cloud Run) — foi pra produção também, é melhoria genuína.
2. **Node 22 vs Node 24** — o emulador local roda no Node global da
   máquina (24), não no pinado no `package.json` (22), e isso quebra
   `admin.firestore.FieldValue` em qualquer escrita local
   (`TypeError: Cannot read properties of undefined (reading
   'serverTimestamp')`). Não é bug de código — confirmado rodando o mesmo
   código via script direto (`node tools/algo.js`, sem o emulador por
   perto) contra produção, funcionando perfeitamente. Sem solução de
   código; documentado como limitação do ambiente local (ver "Armadilhas
   já pagas" do `CLAUDE.md`).

Diante disso, o caminho escolhido foi: **deploy do backend em produção**
(`firebase deploy --only functions:api`) + teste ponta a ponta direto
contra o Firestore real via script (`tools/testar-subcategoria-ponta-a-
ponta.js`, família descartável criada e apagada) — passou tudo (CRUD,
lançamento com subcategoria enriquecida, as duas travas de integridade).
`diagnostico-assinatura.js` confirmou as 10 famílias reais intactas antes
do deploy.

**Acesso local pro Kirk acompanhar visualmente**: emulador de Functions +
frontend local, ambos apontando pro Firestore de produção real (só
GET/leitura funciona local, por causa do bug do Node acima) —
`APP_CHECK_ENFORCE` precisou ser editado DENTRO do
`.env.financeiropessoal-29b32` (passar por variável de ambiente no shell
não funciona, o Firebase recarrega o arquivo por cima) pra passar pelo
App Check sem reCAPTCHA configurado em `localhost`.

### Bloco 3 — teste ao vivo pelo WhatsApp, dois bugs reais achados

Kirk testou pelo WhatsApp com uma conta de teste dedicada
(`liontech.sup@gmail.com`, nome fictício "Vinicius Alvaro",
householdId `bgo6KJKTgCqC1HN2Jqzh`) — **nunca na família Kirk real**, por
pedido dele. Subcategorias de teste (Padaria, Açougue, Hortifruti sob
Mercado) criadas por script nessa conta.

Resultado: os matches diretos e confiantes da IA (pão→Padaria,
carne→Açougue, alface/tomate→Hortifruti) e o comando manual funcionaram de
primeira. Mas os casos ambíguos ("gastei 30 no mercado", sozinho) ficavam
**sem subcategoria e sem pergunta nenhuma** — sem erro nenhum no log.

**Bug real 1 — modo individual sem remetente.** No chat "Mensagens para
mim" (modo individual), o WhatsApp reporta TODA mensagem como
`fromMe: true` — inclusive as da própria pessoa. `extrairMensagem()` só
preenche `senderJid` quando `fromMe` é falso (mesma trava documentada como
"TRAVA DO MODO INDIVIDUAL"), então `senderJid` nunca vinha, e o código
desistia de perguntar por "remetente não identificável" antes mesmo de
tentar. Corrigido: `lancamentoPorMensagem.telefoneEfetivo()` cai pro dono
do canal (`whatsappConfigs.ownerJid`) quando `senderJid` não vier — usado
tanto pra criar a pendência quanto pra resolver a resposta. Em modo grupo
isso nunca acontece.

**Bug real 2 — comando manual sem estado de resposta.** Ao digitar
`subcategoria carne` (nome que não existe), a resposta listava as opções
("Açougue, Hortifruti, Padaria") mas não guardava pendência nenhuma — a
resposta seguinte do Kirk ("Açougue") caía no vazio. Corrigido:
`comandoMudarSubcategoria` agora abre a MESMA pendência de confirmação que
a IA usa quando não encontra o nome digitado, então a resposta seguinte já
aplica.

Deploy de cada correção feito na hora, testado de novo pelo Kirk, confirmado
funcionando (incluindo "pular" limpando a subcategoria).

**Bug real 3 (achado depois, revisando com o Kirk) — mensagem inconsistente.**
A resposta de "não encontrei a subcategoria X" dizia "responda com o número
ou o nome" mas listava as opções separadas por vírgula, sem numerar —
diferente da pergunta automática da IA, que numera. Corrigido: as duas
agora usam o mesmo formato numerado. Deploy feito, confirmado com `curl`
que o App Check continuava ligado depois.

### Incidente — App Check desligado em produção por alguns minutos

Ao preparar o acesso local pro Kirk, `APP_CHECK_ENFORCE` foi editado pra
`false` no `.env.financeiropessoal-29b32` (necessário pra testar local).
Um dos deploys de correção do Bloco 3 foi feito **sem reverter esse
valor primeiro** — `firebase deploy` empacota esse arquivo junto, então
App Check ficou desligado em produção de verdade por alguns minutos, até
ser percebido e corrigido (revertido + redeployado + confirmado com
`curl`). Log de acesso da API nesse intervalo revisado: só tráfego do
próprio Kirk (mesmo IP, padrão de uso normal — dashboard, categorias,
lançamentos), nenhum sinal de terceiro. Sem dano, mas o erro foi real —
ver regra 14 do `CLAUDE.md`, criada por causa disso.

### Publicação

Backend deployado várias vezes ao longo da sessão (uma por correção).
Frontend: **`git push` liberado pelo Kirk só depois de tudo testado** —
dois commits (um de documentação da sessão de WhatsApp Cloud API que
tinha ficado pendente, outro da feature de subcategoria inteira), publicado
em `revelacash.com.br` via integração automática Vercel↔GitHub, confirmado
com `curl` + `agent-browser` (console limpo) depois do deploy. Terceira
correção (mensagem numerada) publicada em commit separado.

### Material pro cliente

PDF de 2 páginas explicando a feature pros usuários finais — o que é,
como criar pelo painel, como usar no lançamento, como funciona pelo
WhatsApp (com exemplo real de conversa) e um FAQ curto. No padrão visual
do RevelaCash (logo, roxo `#512b8d`, Outfit). Gerado como HTML e exportado
via `agent-browser pdf`. Salvo em
`C:\Users\Predator\Documents\RevelaCash\guias-usuario\RevelaCash - Como
usar subcategorias.pdf`.

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

### Progresso da migração — checkpoint pra retomar (10/08/2026)

O Kirk começou a execução ao vivo, dentro do Business Manager
(business.facebook.com → Configurações → Contas do WhatsApp), no portfólio
"Lion Tech" (Business ID `1140397533171413`).

**Feito:**
- [x] Verificação de negócio da Lion Tech — já estava pronta desde
      18/10/2025, não precisou fazer nada
- [x] Passou pela tela de login travada em "chave de acesso" (passkey) do
      Meta — resolvido criando a passkey de verdade pelo app do Facebook no
      iPhone (Central de Contas → Senha e segurança → Chaves de acesso)
- [x] Localizou "Contas do WhatsApp" no menu — já existem várias WABAs
      antigas da Lion Tech nessa lista (`liontechloja`, `Liontechsolucoes`,
      `Liontechsalvy`, `liontechvivo`, `Kirk Douglas - Lion Tech`, `Kirk`,
      `Test WhatsApp Business Account`, entre outras) — **nenhuma delas é
      do RevelaCash**, não confundir/reaproveitar
- [x] Clicou em "Adicionar" → escolheu **"Crie uma nova conta do WhatsApp
      Business"** (não "Solicite pra um cliente", não "Vincular uma conta
      existente")
- [x] Número novo e dedicado ativado e verificado por SMS (código de 6
      dígitos aceito). WABA **`revelacash`**, ID **`1517576109683204`**,
      número **+55 64 9613-0798**. Status em "Phone numbers": "Pendente"
      (análise automática da Meta — normal, não bloqueia o próximo passo) e
      nome de exibição "revelacash" em "Em análise" (revisão separada).

- [x] App criado em developers.facebook.com: **`revelacash`**, App ID
      `1581075037136939`, vinculado ao business `1140397533171413`
      (Kirk Douglas / Lion Tech), caso de uso "Conectar-se com clientes
      pelo WhatsApp".
- [x] Confirmado no WhatsApp Manager: WABA `revelacash`
      (`1517576109683204`) e número `+55 64 9613-0798` vinculados certo ao
      app. **Phone Number ID: `1229153730286556`** (ID interno usado nas
      chamadas da API, diferente do número em si).

IDs de referência desta migração (guardar, não são segredo):
- App ID: `1581075037136939`
- WABA ID (`revelacash`): `1517576109683204`
- Phone Number ID: `1229153730286556`
- Business ID (Lion Tech): `1140397533171413`

- [x] Usuário do sistema `revelacash-api` (ID `61592788245665`, acesso
      Employee) criado no portfólio Lion Tech. WABA `revelacash` atribuída
      com acesso total. Papel adicionado no app `revelacash` (Contas →
      Apps) pra desbloquear as permissões — sem isso o passo de "Gerar
      token" mostra "Nenhuma permissão disponível".
- [x] **Token de usuário do sistema gerado** com `whatsapp_business_management`
      + `whatsapp_business_messaging`, salvo no Secret Manager como
      `WHATSAPP_CLOUD_API_TOKEN` (`firebase functions:secrets:set
      WHATSAPP_CLOUD_API_TOKEN --project financeiropessoal-29b32`, rodado
      no terminal do Kirk — nunca colado no chat). Confirmado existente via
      `firebase functions:secrets:access` (sem exibir o valor).
- [x] **Token testado contra a API real da Meta** — chamada de leitura
      (`GET /{phone-number-id}?fields=verified_name,display_phone_number,
      quality_rating,code_verification_status`, `curl` direto, sem passar
      pelo código do projeto): respondeu 200 com `verified_name:
      "revelacash"`, `code_verification_status: "VERIFIED"`. Confirma
      token + Phone Number ID + permissões corretos. Não manda mensagem
      (bloqueado mesmo, por falta de forma de pagamento na conta) — só
      confirma autenticação.

**Por que esperar 30 dias antes da OBA**: é exigência da Meta (não do
nosso código) — junto com política de mensagens comerciais cumprida,
verificação de negócio (já feita), 2FA no número e nome de exibição
aprovado. Sem a OBA a **Groups API** não libera, e o "modo grupo" do
canal (`whatsappConfigs.modo`) depende dela na Cloud API — só o modo
individual funciona por Cloud API nesse meio tempo. A Evolution API
continua sendo o canal ativo dos clientes reais até a migração de fato
acontecer; nada foi trocado ainda.

**Atualização — 12/08/2026: número registrado, `status: CONNECTED`.**
O `status` do número ficou em "Pendente" por dois dias porque faltava o
passo de registro (`POST /{phone-number-id}/register`, obrigatório antes de
qualquer número aceitar mensagem pela Cloud API — não resolve sozinho só
esperando). Rodado direto contra a API real (não passou pelo
`cloudApiProvider.js` ainda, é uma chamada isolada): `POST
/1229153730286556/register` com `pin` de 2 etapas escolhido pelo Kirk
(guardado só na cabeça dele, não em arquivo — é o PIN de recuperação do
número). Resposta `{"success": true}`, confirmado em seguida por `GET
/1229153730286556?fields=status,...`: `status: CONNECTED`. `name_status`
continua `PENDING_REVIEW` (aprovação do nome de exibição "revelacash",
revisão passiva da Meta, não bloqueia uso) e `quality_rating: UNKNOWN`
(normal até trocar mensagem de verdade). **Os 30 dias corridos pra pedir a
OBA começam a contar a partir de hoje, 12/08/2026.**

**Falta (retomar exatamente daqui):**
1. Testar `cloudApiProvider.js` (o código do adapter em `src/canais/`,
   ainda não exercitado) contra a API real usando o token
   (`WHATSAPP_CLOUD_API_TOKEN`), o Phone Number ID (`1229153730286556`) e
   o WABA ID (`1517576109683204`) — o registro e as chamadas de teste até
   agora foram feitos por fora, direto na API; tratar o código do adapter
   como não verificado até passar por um teste ponta a ponta de verdade
2. Deixar rodando 30 dias corridos na Cloud API antes de poder pedir a OBA
   (contando desde 12/08/2026)
3. Depois dos 30 dias: WhatsApp Manager → Phone numbers → Profile →
   Official Business Account → Submit Request (gratuito)
4. Groups API libera sozinha com a OBA aprovada

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
0. **Kirk testar a importação de extrato com o arquivo real do banco dele**
   — os testes sintéticos passaram todos (17/17 contra produção + tela
   verificada), mas formato de banco real é onde aparece a surpresa
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

**Importação de extrato bancário** (no ar desde 16/08/2026)
- `/importar` no painel: sobe OFX/CSV do banco, confere na tela, importa em
  lote. Só mês já fechado; duplicidade impossível por construção (ID do
  lançamento = impressão digital da linha do banco); dá para desfazer o lote
  inteiro. Exige assinatura paga. Detalhe na sessão de 16/08/2026
- **Ainda não exercitado com extrato real de banco** — só com arquivos
  sintéticos (que passaram 17/17 contra produção). É o teste que falta

**Aviso de cadastro novo no WhatsApp do operador** (no ar desde 16/08/2026)
- Cada cadastro manda nome + telefone para a auto-conversa do Kirk, pelo
  canal da família dele. `NOTIFICACAO_CADASTRO_HOUSEHOLD_ID` liga/desliga

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
- Zero testes no frontend (backend tem 539)
- Importação de extrato: duas compras idênticas no mesmo dia, valor e lugar,
  num CSV **sem ID do banco**, geram a mesma impressão digital — a segunda é
  tratada como já importada e não entra. Em OFX não acontece (o `FITID`
  distingue). Escolha consciente: errar avisando demais é melhor que
  duplicar em silêncio
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
