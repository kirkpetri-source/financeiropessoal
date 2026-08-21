# Chamados de suporte — desenho

**Data:** 21/08/2026 · **revisão 3** (ajustes aplicados, confrontados com o
código, e as três decisões do Kirk fechadas)
**Etapa:** 1 de 3 da Fase 4 (chamados → papéis de operador → central de ajuda)

> Revisão 3: os 19 ajustes foram incorporados e as três escolhas que faltavam
> foram decididas pelo Kirk em 21/08/2026 — ver **"Decisões tomadas"**, no fim.
> A terceira delas mudou o desenho dos anexos: **não há mais signed URL**, o
> arquivo é servido pela própria API. Isso eliminou a dependência de IAM.
> **Spec fechada — o passo seguinte é o plano de implementação.**

## O problema

O RevelaCash não tem canal de suporte. O rodapé da landing manda para o
Instagram e o FAQ termina sem saída: quem não achou a resposta ali não tem para
onde ir. Do outro lado, não existe fila, não existe histórico e não existe como
saber se alguém ficou sem resposta.

Isto resolve a primeira parte: o cliente abre um chamado dentro do sistema,
acompanha ali, e a equipe atende com rastro. As outras duas partes — o que cada
papel de operador pode fazer, e a central de ajuda com conteúdo — vêm depois,
cada uma com seu próprio desenho.

## Decisões, e por quê

**O chamado vive no Firestore. E-mail é só aviso.** Ninguém responde por
e-mail; o sistema nunca lê caixa de entrada. Receber e interpretar e-mail traz
thread quebrada, citação, anexo e remetente falsificado — problemas que não
pagam o benefício enquanto o volume é o de uma operação começando.

**Só cliente logado abre chamado.** O botão fica na landing, mas passa pelo
login. Assim todo chamado tem dono e família, e nada foge do isolamento por
tenant. Quem ainda não é cliente continua no WhatsApp do rodapé: dúvida de
venda não é suporte, e as duas na mesma fila atrapalham as duas.

**Quem enxerga é o dono da conta** (`req.papel === 'owner'`). Hoje existe UM
login por família — membro de WhatsApp é `wa-<telefone>` e não tem senha.
Quando existir convite de membro com login próprio (pendência antiga do
projeto), esta decisão se revisita.

**Aviso não carrega conteúdo.** Nem no WhatsApp, nem no e-mail. A notificação
diz que o chamado #N teve atualização e leva o link. A conversa inteira mora no
sistema, e é lá que se lê e responde. Isso mantém o histórico num lugar só e
evita espalhar assunto de suporte por canal externo.

**Documento único, mensagens dentro dele.** `escopoDe()` opera em coleções raiz
com `householdId` e é ele que impede query sem tenant (regra 3). Subcoleção não
passa por essa barreira e seria a primeira do sistema fora dela. Separar as
mensagens em coleção própria também criaria a primeira query do sistema com
duas igualdades mais ordenação, exigindo índice composto — custo que o volume
atual não justifica. Ver os limites e o gatilho de migração na seção
"Mensagens dentro do documento".

**Sem prioridade na primeira versão.** Se o cliente escolhe, tudo vira urgente e
o campo deixa de informar. A fila ordena por quem espera há mais tempo.

**Atendente não é administrador.** A coleção `operadores` só faz sentido se
existir uma autorização que aceite atendente sem entregar o painel inteiro. Ver
a seção seguinte.

## Autorização de operador

Hoje `apenasAdmin` (`src/middlewares/admin.js`) responde sim ou não a partir de
`ADMIN_EMAILS` no `.env` ou de um custom claim. Não tem nome, não tem lista, não
tem destinatário possível para encaminhamento — e **mudar quem é admin hoje
exige editar o `.env` e fazer deploy**.

Entra `apenasOperadorAtivo` (`src/middlewares/operador.js`), que valida:

1. ID token do Firebase válido (o `authMiddleware` de sempre, antes dele);
2. existe `operadores/{req.userId}`;
3. `ativo === true`.

Ele deixa em `req.operador` o registro (`{ uid, nome, papel, ativo }`), que é o
que o encaminhamento e o `adminAuditLog` usam para dizer quem fez.

**Rotas de atendimento aceitam operador ativo. Tudo que já existe no
`/plataforma` continua atrás de `apenasAdmin`, sem alteração.** A matriz
completa de permissões é a etapa 2; aqui só se evita o acoplamento.

### O detalhe do Express que decide isso funcionar

`src/routes/admin.js` faz `router.use(authMiddleware, apenasAdmin)` na linha 29,
e isso vale para **tudo** que for registrado depois. Pendurar a fila de chamados
nesse router transformaria todo atendente em admin outra vez, em silêncio.

Então a rota do operador nasce em arquivo próprio,
`src/routes/chamadosOperador.js`, montada em `app.js` **antes** da linha do
admin:

```js
app.use('/plataforma/chamados', chamadosOperadorRoutes);  // apenasOperadorAtivo
app.use('/plataforma', adminRoutes);                      // apenasAdmin (inalterado)
```

O Express casa na ordem de registro, então `/plataforma/chamados/*` nunca chega
ao router do admin. A ordem das duas linhas é requisito, não estilo — inverter
volta a exigir admin para atender.

### Como o primeiro operador nasce

`tools/criar-login-operador.js` já cria o login no Firebase Auth (e-mail interno
`<usuario>@operador.revelacash.internal`, exigido só porque o Auth pede formato
de e-mail). Ele passa a gravar também `operadores/{uid}` com nome, papel e
`ativo: true`. Criar operador pela tela é a etapa 2.

`ADMIN_EMAILS` continua existindo e continua sendo o que define ADMIN. Um
operador ativo que não esteja em `ADMIN_EMAILS` atende chamados e não vê o
resto do painel — que é exatamente o ponto.

## Modelo de dados

### `supportTickets` (coleção raiz, escopada)

| campo | tipo | observação |
|---|---|---|
| `householdId` | string | carimbado pelo escopo, como em toda coleção escopada |
| `numero` | number | identificador legível e global ("chamado #42") |
| `assunto` | string | uma linha, escrita pelo cliente |
| `categoria` | enum | `DUVIDA` · `PROBLEMA` · `COBRANCA` · `SUGESTAO` |
| `status` | enum | `ABERTO` · `EM_ANDAMENTO` · `AGUARDANDO_CLIENTE` · `RESOLVIDO` |
| `mensagens` | array | `{ id, autor, autorNome, texto, anexos[], em }`; `autor` é `CLIENTE` ou `SUPORTE` |
| `quantidadeMensagens` | number | evita `mensagens.length` em listagem que não carrega o array |
| `naoLidoPeloCliente` | boolean | acende o indicador no painel do cliente |
| `naoLidoPeloOperador` | boolean | acende o indicador na fila |
| `abertoPor` | `{ uid, nome }` | quem abriu |
| `atribuidoA` | string \| null | uid do operador responsável |
| `atribuidoEm` | timestamp \| null | quando foi encaminhado |
| `aguardandoOperadorDesde` | timestamp \| null | **é este que ordena a fila** |
| `ultimaMensagemEm` | timestamp | última atividade, de qualquer lado |
| `ultimaMensagemPor` | enum | `CLIENTE` · `SUPORTE` |
| `statusAlteradoEm` | timestamp | quando o status mudou pela última vez |
| `criadoEm` | timestamp | |
| `resolvidoEm` | timestamp \| null | |
| `resolvidoPor` | string \| null | uid do operador, ou `'SISTEMA'` |
| `motivoResolucao` | enum \| null | `OPERADOR` · `INATIVIDADE_CLIENTE` |
| `reaberturaDe` | number \| null | número do chamado anterior, quando nasce de resposta fora da janela |

`createdAt`/`updatedAt` são carimbados pelo próprio escopo (`escopo.js` já faz
isso em `criar`/`atualizar`) — `criadoEm` existe além deles porque o resto do
desenho fala em português e a fila precisa de um campo estável de leitura. Não
há terceiro campo de data duplicando os dois.

**`aguardandoOperadorDesde` é o campo da fila, e não `ultimaMensagemEm`** (item
8). `ultimaMensagemEm` também sobe quando o operador responde, então ordenar por
ele coloca na frente quem acabou de ser atendido. A regra:

| evento | `aguardandoOperadorDesde` |
|---|---|
| cliente abre chamado | agora |
| cliente responde | agora |
| operador responde | `null` |
| chamado resolvido (por quem for) | `null` |
| reaberto por resposta do cliente | agora |

### `operadores` (coleção raiz, NÃO escopada)

| campo | tipo | observação |
|---|---|---|
| `uid` | string | id do doc; é o uid do Firebase Auth |
| `nome` | string | aparece na fila e no encaminhamento |
| `papel` | enum | `ADMIN` · `ATENDENTE` — nesta etapa só informativo |
| `ativo` | boolean | desligar sem apagar preserva o histórico de quem atendeu |

Não é escopada de propósito: operador não pertence a família nenhuma. É lida
por `apenasOperadorAtivo` a cada requisição de atendimento.

### `counters/supportTickets` (documento raiz, NÃO escopado)

`{ ultimo: number }`. O incremento e a criação do chamado acontecem **na mesma
transação** (item 10): número consumido sem chamado criado deixa buraco na
numeração que ninguém consegue explicar depois. Contar documentos para descobrir
o próximo número tem corrida — dois chamados simultâneos receberiam o mesmo. É a
mesma lição do log de mensagem do WhatsApp (regra 23).

### `notificacoesNaoEntregues` (coleção raiz, NÃO escopada)

| campo | observação |
|---|---|
| `tipo` | `CHAMADO_NOVO` · `SUPORTE_RESPONDEU` · `CLIENTE_RESPONDEU` · `ENCAMINHADO` |
| `ticketId`, `numero`, `householdId` | para achar o chamado |
| `canal` | `EMAIL` · `WHATSAPP` |
| `destinatario` | e-mail ou JID |
| `erro` | mensagem do provedor, truncada |
| `criadoEm`, `resolvida` | `resolvida` é o operador dando baixa na mão |

Cross-tenant por natureza, como `adminAuditLog`. A aba Chamados lê
`where('resolvida','==',false)` **sem `orderBy`** e ordena em memória (regra 12).

## Mensagens dentro do documento

Decisão mantida (item 7). Em troca, limites explícitos por causa do teto de 1 MB
por documento do Firestore:

- **5.000 caracteres** por mensagem
- **5 anexos** por mensagem
- anexo entra por referência (`storagePath` e metadados), nunca o binário
- acrescentar mensagem usa `arrayUnion` — **nunca** ler o array, alterar e
  reescrever

Conta de guardanapo do pior caso: 5.000 caracteres em UTF-8 ficam em ~5 KB, mais
os metadados de 5 anexos (~1 KB). Chamado com 150 mensagens no limite máximo dá
~900 KB. Na prática uma mensagem de suporte tem algumas centenas de caracteres.

**Gatilho de migração para coleção própria:** quando qualquer chamado passar de
**200 mensagens**, ou o documento passar de **700 KB**. `quantidadeMensagens`
existe para essa vigilância ser barata — a aba Chamados avisa o operador em vez
de o sistema descobrir estourando. Migrar significa mover `mensagens[]` para
`supportMessages` (escopada, com `ticketId`) e assumir o índice composto.

## Concorrência e atomicidade

Responder muda vários campos de uma vez: mensagem nova, status,
`aguardandoOperadorDesde`, `naoLido*`, `ultimaMensagemEm`, `ultimaMensagemPor`,
`statusAlteradoEm`, `quantidadeMensagens`. Cliente e operador podem responder
quase ao mesmo tempo (item 6).

**Regra:** toda mudança em chamado é **uma escrita atômica só**, com `arrayUnion`
para a mensagem e `FieldValue.increment(1)` para a contagem. Nada de
ler-modificar-escrever no array.

**Nenhum envio externo dentro de transação.** Persiste primeiro, notifica
depois — e-mail e WhatsApp são lentos e falham, e uma transação segurando
conexão enquanto espera provedor externo é como se perde escrita no Firestore.

### O que isso exige de `src/data/escopo.js`

O acessor de hoje tem `consultar`, `consultarPadroes`, `buscarDoc`, `criar`,
`criarComId`, `atualizar`, `remover` e `docDaFamilia`. **Nenhum deles serve
aqui**: `criar` usa `add()` e não entra em transação; `atualizar` faz
ler-depois-escrever em duas viagens, sem atomicidade, e não aceita sentinelas.

Duas adições, e nenhum service usando `db` cru para chamado de cliente:

| método novo | o que faz | por que dentro do escopo |
|---|---|---|
| `criarEmTransacao(tx, colecao, ref, dados)` | `tx.create()` carimbando `householdId`, `createdAt`, `updatedAt` | é a criação do chamado junto do contador; fora do escopo seria a primeira escrita de coleção escopada sem a barreira |
| `atualizarAtomico(colecao, id, montarPatch)` | transação que lê o doc, **confere o `householdId` dentro dela** e aplica o patch (aceita `arrayUnion`/`increment`) | mantém a conferência de dono e ganha atomicidade; `householdId` continua não-alterável |

`atualizarAtomico` recusa `householdId` no patch, como `atualizar` já faz.

**Este é o arquivo mais sensível do projeto** (regra 3, 16 testes de vazamento).
Os testes de isolamento existentes precisam cobrir os dois métodos novos antes
de qualquer rota usá-los. **Decidido pelo Kirk em 21/08/2026: pode mexer no
`escopo.js`** — a alternativa (chamado falando com o banco por fora da portaria)
foi recusada, porque abriria precedente para a próxima feature copiar.

## Ciclo de vida

```
                  cliente abre
                       │
                       ▼
                   [ABERTO] ──── operador responde ──▶ [AGUARDANDO_CLIENTE]
                       │                                      │
          cliente responde                          cliente responde
                       │                                      │
                       ▼                                      ▼
                [EM_ANDAMENTO] ◀───────────────────────────────
                       │
        operador marca resolvido  ·  ou 15 dias sem resposta
                       │
                       ▼
                  [RESOLVIDO] ──── cliente responde ──▶ [EM_ANDAMENTO]
                   (até 30 dias)         (depois: chamado NOVO,
                                          com reaberturaDe)
```

Operador respondendo em qualquer estado leva para `AGUARDANDO_CLIENTE`; cliente
respondendo leva para `EM_ANDAMENTO`. É o que faz a fila mostrar, sem julgamento
humano, de quem é a vez.

**Encerramento automático não ganha status novo** (item 2). Chamado em
`AGUARDANDO_CLIENTE` há 15 dias vira `RESOLVIDO` com
`motivoResolucao: 'INATIVIDADE_CLIENTE'` e `resolvidoPor: 'SISTEMA'`. Quem marca
por decisão grava `OPERADOR` e o uid. A distinção fica no motivo, não no estado —
assim a fila, a tela e os relatórios continuam com quatro estados.

Resolver não esconde nada: o histórico continua visível para o cliente.

**Janela de reabertura: 30 dias** (item 17). Resposta dentro da janela reabre —
`resolvidoEm`, `resolvidoPor` e `motivoResolucao` voltam a `null`,
`aguardandoOperadorDesde` recebe agora, status vira `EM_ANDAMENTO`. Passada a
janela, a resposta **abre chamado novo** com `reaberturaDe: <numero anterior>`, e
a tela do cliente mostra o link para o antigo. Chamado de três meses atrás
ressuscitando no topo da fila é ruído; e o histórico não se perde de qualquer
jeito.

**`atribuidoA` é informativo nesta etapa** (item 18). Qualquer operador ativo
continua podendo responder qualquer chamado, atribuído a ele ou não. Isso está
escrito aqui para não virar regra implícita quando a etapa 2 chegar.

## Fluxos

### Cliente

Item novo no Sidebar: **Suporte**, com `/suporte` (lista) e `/suporte/:numero`
(o chamado). A lista mostra status e um ponto no que tem resposta não lida. O
formulário de abertura pede assunto, categoria, descrição e anexos.

O link enviado no aviso aponta direto para `/suporte/:numero`. Com a sessão
expirada, o `PrivateRoute` guarda a rota e o login devolve a pessoa exatamente
ali — comportamento que já existe e é a razão de o link ser direto.

Na landing, a seção de dúvidas (`id="duvidas"`, `LandingPage.jsx:613`) ganha a
saída que hoje não tem: "Não achou sua resposta? Abrir chamado", que leva ao
login e de lá ao painel.

### Operador

Aba nova **Chamados** em `AdminPage.jsx` (o arquivo que monta as abas do
`/plataforma`), ao lado de Dashboard, Clientes e Comunicação. A fila lista todas
as famílias, ordenada por `aguardandoOperadorDesde` mais antigo, com filtro por
status. O operador abre, responde, encaminha para outro operador ativo e marca
resolvido. A aba mostra também o aviso de notificação não entregue.

Toda ação dele grava em `adminAuditLog`: quem fez, em qual família, quando. É o
mesmo rastro das outras ações do painel gestor.

A fila lê todas as famílias — a mesma exceção declarada que o `/plataforma` já
tem. Toda leitura cross-tenant de chamado mora num arquivo só,
`src/services/chamadosPlataformaService.js`, espelhando `adminAuditService.js`.
O service do cliente (`src/services/chamadoService.js`) usa **exclusivamente**
`escopoDe`. Dois arquivos, duas regras, nenhuma dúvida na revisão de código.

## Fila e limites

### Estratégia da fila: (a), decidida (item 15)

Filtra por `status` no Firestore, ordena em memória, **com teto de registros**.
Não por causa do dublê de testes — por causa do volume: 13 famílias pagantes, e
uma operação de suporte que começa agora. Paginação por cursor exige `orderBy`
no banco, que exige índice composto; e as duas coisas não convivem.

Três decisões práticas que fazem (a) se sustentar:

- **`.select()` na listagem.** A query da fila projeta só o que a lista mostra
  (`numero`, `assunto`, `status`, `householdId`, `aguardandoOperadorDesde`,
  `naoLidoPeloOperador`, `quantidadeMensagens`) e **nunca traz `mensagens[]`**.
  Sem isso, abrir a fila baixaria a conversa inteira de todo mundo.
- **Teto de 200 registros por consulta**, com o total devolvido junto. Passar
  disso é o sinal de que a fila precisa de índice composto e cursor — está na
  seção de dívidas.
- O detalhe do chamado (`/plataforma/chamados/:id`) é uma leitura de documento
  só, aí sim com as mensagens.

Quando a fila crescer, migra para (b): índice composto declarado em
`firestore.indexes.json` e cursor de verdade. O gatilho é o teto acima.

### Limites antiabuso (item 16)

| limite | valor | onde |
|---|---|---|
| chamados abertos por família | 5 simultâneos | contado na criação, com `.select('status')` — sem trazer as mensagens |
| caracteres por mensagem | 5.000 | schema zod, cliente e operador |
| anexos por mensagem | 5 | schema + validação de upload |
| tamanho por anexo | 5 MB | validação de upload |

"Abertos" = `ABERTO`, `EM_ANDAMENTO` ou `AGUARDANDO_CLIENTE`.

**Correção ao item 16:** *não existe rate limit por família nas rotas HTTP para
reaproveitar.* `src/middlewares/rateLimit.js` é por IP e em memória;
`limiteMensagensService` é por família mas só vale para mensagem do WhatsApp, e
também em memória. O que protege as rotas de chamado é o `limiteGeral` (300
req/min por IP, já montado em `app.js`) mais o teto de 5 chamados abertos, que é
por família por construção. Nenhum middleware novo — ver "O que o código
contrariou".

## Anexos

Upload passa pela API, não do navegador direto para o Storage. Assim a
autorização fica no mesmo lugar que protege o resto (`escopoDe` dentro do
Express), em vez de virar um segundo conjunto de regras que pode divergir do
primeiro.

- caminho: `chamados/{householdId}/{ticketId}/{nomeAleatorio}`
- **nome interno aleatório**, nunca o nome que o cliente mandou (o original fica
  só nos metadados, para exibir)
- limite: 5 MB por arquivo, 5 por mensagem
- tipos: PNG, JPG/JPEG, PDF
- **validação por magic bytes no backend** — extensão e `Content-Type` do
  navegador são texto escolhido por quem envia. `src/utils/tipoDeArquivo.js`,
  8 bytes de cabeçalho, sem dependência nova

### O que fica no Firestore (item 11)

Só metadados: `storagePath`, `nomeOriginal`, `mimeType`, `tamanho`, `enviadoEm`.
Nenhuma URL é persistida.

### A leitura do anexo — decidida em 21/08: pela API, sem signed URL

`GET /suporte/chamados/:numero/anexos/:anexoId` autentica pelo Bearer de
sempre, resolve o household por `escopoDe`, confere que o anexo pertence àquele
chamado daquela família, lê o objeto do Storage pelo Admin SDK e **devolve os
bytes**, com `Content-Type` e `Content-Disposition`. O frontend consome com
`responseType: 'blob'` — o mesmo caminho que `MeusDados.jsx` já usa para o
export.

Por que não a signed URL, que era o desenho anterior:

- `getSignedUrl` dentro de Cloud Functions v2 exige o papel **Service Account
  Token Creator** na conta de serviço em uso, e a falha é de **runtime**, não de
  deploy — sobe verde e quebra na cara do cliente.
- Pior, é **impossível de testar com honestidade daqui**: local o Admin SDK
  assina com a chave privada do JSON e funciona sempre; a function no ar não tem
  chave e depende do `signBlob`. Teste local dá verde e produção dá 403.
- Servir pela API tira a dependência inteira e reusa autorização que já existe.

O que se paga: o arquivo trafega pela function. Com 5 MB de teto e o volume de
uma operação começando, é ruído no custo. Se um dia virar tráfego de verdade, a
signed URL volta à mesa — aí com o papel de IAM concedido de propósito e testado
no ar, não na máquina.

### Transporte do upload

Base64 dentro do JSON, numa rota com limite próprio de corpo, montada antes do
parser global — **exatamente o padrão que `/importacao` já usa** em `app.js`:

```js
app.use('/suporte/anexos', express.json({ limit: '8mb' }));
```

5 MB binários viram ~6,7 MB em base64, então 8 MB dá folga. Multipart exigiria
`multer`, uma dependência nova numa function que hoje tem oito. Se o upload
crescer (vídeo, por exemplo), multipart volta à mesa.

### Falha parcial (item 12)

Anexo que falha **não invalida a mensagem**. O upload acontece **antes** da
gravação da mensagem: sobe os arquivos, coleta quais deram certo, grava a
mensagem apenas com esses e devolve a lista do que falhou para a tela mostrar
("2 de 3 anexos enviados; tente reenviar o terceiro"). Assim **nenhum documento
aponta para arquivo inexistente no Storage** — a ordem inversa (gravar e depois
subir) é justamente a que cria referência quebrada.

O contrário — arquivo no Storage sem documento apontando — é possível se a
gravação falhar depois do upload. É lixo, não é corrupção, e some com a família
na exclusão da LGPD (que passa a apagar por prefixo).

### Regras do Storage — buraco a fechar

Hoje **não existe `storage.rules` no repositório** e o `firebase.json` não tem
seção de storage. O bucket de produção existe
(`financeiropessoal-29b32.firebasestorage.app`); o de homologação **não existe
ainda**. Sem regra publicada, o padrão do Firebase deixa qualquer usuário
autenticado ler e escrever o bucket inteiro — e o cliente do RevelaCash é
autenticado.

Entra no escopo desta etapa: `storage.rules` negando tudo
(`allow read, write: if false`), seção `storage` no `firebase.json`, e deploy.
O backend usa o Admin SDK, que passa por cima das regras — nada quebra.

## Notificações

Serviço novo `emailService.js`, com Resend e chave no Secret Manager
(`RESEND_API_KEY`). Falha de envio **nunca** derruba a operação: o chamado é
criado do mesmo jeito. É a regra que o `notificacaoOperadorService` já segue.

| evento | quem recebe | por onde |
|---|---|---|
| chamado novo | equipe | e-mail + WhatsApp do operador |
| suporte respondeu | dono da conta | WhatsApp da família + e-mail |
| cliente respondeu | equipe | e-mail + WhatsApp do operador |
| chamado encaminhado | novo responsável | e-mail |

**Nenhum aviso carrega o texto da mensagem.** O corpo diz que o chamado #N teve
atualização e leva o link. Decisão de produto e de privacidade, não detalhe de
implementação — e tem teste que afirma isso sobre o corpo efetivamente enviado.

### Falha registrada, sem retry automático (item 13)

Erro só no log some. Toda falha de envio grava em `notificacoesNaoEntregues` e
aparece como aviso na aba Chamados, para o operador dar baixa na mão.

**Não** entra outbox com backoff, tentativas e worker: o volume não justifica, e
retry disparado pela rotina diária entregaria a notificação 24 horas depois —
inútil para suporte. Fica na seção de dívidas.

### De qual instância sai o aviso ao operador (item 5)

Conferido no código: **não existe "instância da plataforma".** O canal Evolution
é um por família (`fam-<householdId>`, `src/config/evolutionServidor.js`), todos
num servidor central do operador. O aviso de cadastro que já existe hoje resolve
isso reusando **o canal da própria família do operador**, mandando para o
`ownerJid` (a auto-conversa dele) — nunca para o grupo, nunca pelo canal do
cliente.

Esta etapa segue o mesmo caminho, com variável própria:
`SUPORTE_WHATSAPP_HOUSEHOLD_ID` (com `NOTIFICACAO_CADASTRO_HOUSEHOLD_ID` como
padrão quando ela não existir). Sem a variável, o aviso por WhatsApp fica
desligado e sobra o e-mail — igual ao aviso de cadastro hoje.

**Fica garantido o que você pediu: o aviso ao operador nunca sai pela instância
da família do cliente.** Uma instância dedicada de plataforma, fora de qualquer
família, é a solução limpa — mas exige um documento de config que não é
`whatsappConfigs/{householdId}` e um caminho de envio que não passe por
`respostaWhatsapp.responder` (que grava log sob um `householdId`). Isso é
infraestrutura nova, não cabe nesta etapa, e está registrado nas dívidas.

**Decidido pelo Kirk em 21/08/2026: o canal da própria família dele.** O aviso
some se ele desconectar o WhatsApp do sistema — e nesse caso sobra o e-mail, que
não depende de canal nenhum.

### Endereços

Não ficam no código: `SUPORTE_EMAIL_DESTINO` (caixa da equipe) e
`SUPORTE_EMAIL_REMETENTE` (o `suporte@revelacash.com.br` verificado) são
variáveis de ambiente, como os outros destinos do projeto. O e-mail do cliente
vem do Firebase Auth do dono da conta — não há campo novo para manter.

### O domínio hoje

`revelacash.com.br` não tem MX nem SPF: não recebe e-mail e nada está
autorizado a enviar em nome dele. O DNS está no registro.br, não delegado à
Vercel.

- **Enviar**: Resend com o domínio verificado (SPF + DKIM). Enquanto o DNS
  estiver no registro.br, colar esses registros é ação manual do Kirk. Delegar
  o DNS à Vercel resolveria por CLI.
- **Receber**: caixa que já existe (Gmail do Kirk) como destino dos avisos
  internos. Caixa própria em `@revelacash.com.br` entra quando houver equipe —
  é a etapa 2.

## Rotina diária

`exports.executarExclusoes` **mantém o nome** (item 14). Renomear em produção
cria agendada nova no Cloud Scheduler e deixa a antiga viva, rodando código
velho — dois jobs apagando família é o pior resultado possível aqui.

Hoje o corpo da agendada está inline em `index.js` (linhas 67-85), chamando
`familiasParaApagar` e `apagarHousehold` direto, sem try/catch por item. Passa a
chamar dois serviços independentes, cada um com o seu:

```js
exports.executarExclusoes = onSchedule({ /* inalterado */ }, async () => {
  try { await lgpdService.executarExclusoesPendentes(new Date()); }
  catch (err) { console.error('[LGPD] Falhou:', err.message); }

  try { await chamadoService.resolverInativos(new Date()); }
  catch (err) { console.error('[Chamados] Varredura falhou:', err.message); }
});
```

Falha de um não impede o outro. O corpo da LGPD só muda de lugar — mesma lógica,
agora testável sem subir a agendada.

### A varredura dos 15 dias (item 3)

Igualdade em `status` mais range em data é índice composto — o mesmo problema já
reconhecido na fila. Então: filtra `where('status','==','AGUARDANDO_CLIENTE')`
no Firestore, **com `.select()`** (sem trazer `mensagens[]`) e teto de 500
documentos, e aplica o corte dos 15 dias em memória sobre `statusAlteradoEm`. Se
o teto for atingido, o log avisa; o restante entra na rodada do dia seguinte, e
chamado inativo não tem pressa de horas.

Essa query é cross-tenant e vive em `chamadosPlataformaService.js`, junto com a
fila — mesma exceção declarada, um lugar só. Precedente: `familiasParaApagar` já
consulta `households` sem escopo, pelo mesmo motivo.

## LGPD

Três mudanças no `lgpdService`:

1. **`apagarHousehold` passa a apagar `supportTickets`** (mais uma entrada na
   lista de coleções que ele varre) e **os arquivos do Storage da família**, por
   prefixo `chamados/{householdId}/` (`bucket.deleteFiles({ prefix })`). Sem
   isso sobra dado de cliente depois da exclusão — exatamente o que esse serviço
   existe para impedir.
2. **O export passa a incluir os chamados**, com as mensagens e a lista de
   anexos.
3. **`executarExclusoesPendentes`** passa a existir como função do service (item
   14 acima), com o corpo que hoje está no `index.js`.

### Anexo utilizável no export (item 19)

Com a decisão de servir anexo pela API, a saída por link assinado deixou de
existir — e embutir binário em base64 no JSON continua fora de questão (um
chamado com 5 anexos de 5 MB viraria ~33 MB montados na memória de uma function
de 256 MiB com 60 s de timeout).

**O JSON do export leva os metadados de cada anexo** (`nomeOriginal`,
`mimeType`, `tamanho`, `enviadoEm`, o número do chamado e o caminho da API que
o serve) — não os bytes.

**Os bytes vêm pela tela.** `MeusDados.jsx` ganha, ao lado de "Exportar meus
dados", um **"Baixar anexos dos chamados"**: o frontend percorre a lista, busca
cada arquivo pelo mesmo endpoint autenticado da visualização normal e salva um a
um. Portabilidade de verdade, sem link que vence e sem JSON gigante.

Isso funciona inclusive no caso que mais importa — a conta com exclusão pedida.
Ela fica congelada para lançar, mas continua **lendo e exportando** durante os 7
dias (é a regra 6, e é o motivo de o prazo existir). Depois disso os arquivos
somem junto com o resto, que é o ponto da exclusão.

O texto do cabeçalho do export diz isso em uma linha: "os anexos dos chamados
não vêm dentro deste arquivo; baixe pelo botão ao lado, enquanto sua conta
existir".

## Segurança e isolamento

- `supportTickets` é escopada: acesso do cliente só por `escopoDe(householdId)`,
  inclusive nas duas operações novas (`criarEmTransacao`, `atualizarAtomico`).
- Leitura cross-tenant (fila e varredura) fica em `chamadosPlataformaService.js`,
  atrás de `apenasOperadorAtivo`, em rota separada, com registro em
  `adminAuditLog`. Um arquivo só, exceção declarada.
- `operadores` e `counters` não são escopadas por natureza; `operadores` só é
  lida pelo middleware de autorização.
- Upload e leitura de anexo passam pelo mesmo escopo do chamado; o
  `householdId` do caminho no Storage vem de `req.householdId`, **nunca** do
  corpo da requisição.
- `storage.rules` nega acesso direto ao bucket.
- Nenhum aviso externo carrega conteúdo do chamado.
- **Regras do Firestore não mudam**: `firestore.rules` nega tudo
  (`allow read, write: if false`) e o frontend não importa `firebase/firestore`
  — conferido. Ver "O que foi conferido no código".

## Testes

**Unidade, com dublê de banco** (nunca mock de módulo — regra 2):

Isolamento (os que mais importam)
- família B não lê, não responde e não encaminha chamado da família A
- tentativa de manipular `householdId` no corpo da requisição
- acesso a anexo de outra família
- operador inativo tentando atender
- ATENDENTE tentando acessar funcionalidade exclusivamente administrativa (tem
  que bater em `apenasAdmin` e receber 403)
- os dois métodos novos do `escopo.js` recusam documento de outra família

Privacidade
- nenhum aviso, por e-mail ou WhatsApp, contém o texto da mensagem — asserção
  sobre o corpo **efetivamente enviado**, não sobre a intenção

Estado
- cliente e operador respondendo quase ao mesmo tempo: as duas mensagens
  sobrevivem, `quantidadeMensagens` bate, nenhum campo é perdido
- transições de status nas quatro direções
- resolução automática após 15 dias, com `motivoResolucao: INATIVIDADE_CLIENTE`
- reabertura **dentro** da janela de 30 dias: mesmo chamado, campos de resolução
  zerados
- reabertura **fora** da janela: chamado novo com `reaberturaDe` preenchido
- não lido dos dois lados: quem escreve não acende o próprio indicador
- `aguardandoOperadorDesde` zera quando o operador responde e volta quando o
  cliente responde

Anexos
- arquivo acima de 5 MB
- MIME falsificado: `.png` com conteúdo de PDF é recusado pelos magic bytes
- estouro do limite de 5 por mensagem
- falha parcial de upload: a mensagem persiste com os anexos válidos e nenhum
  metadado aponta para arquivo inexistente
- **o endpoint que serve o arquivo recusa anexo de outra família** e recusa
  `anexoId` que existe mas não pertence àquele chamado — os dois com a mesma
  resposta de "não encontrado", para não confirmar existência sondando id

Outros
- falha de notificação não derruba a criação do chamado e fica em
  `notificacoesNaoEntregues`
- teto de 5 chamados abertos por família
- teto de registros da fila e o aviso quando ele é atingido

**O que o dublê NÃO prova.** Ele não reproduz contenção de transação — o teste
de "dois chamados simultâneos recebem números diferentes" passa com dublê
qualquer que seja a implementação, inclusive uma errada. Vale como teste de
forma, não de concorrência. **A prova da numeração atômica é ponta a ponta,
contra homologação.** O dublê também precisa aprender `.select()`, que a fila e
a varredura usam.

**Ponta a ponta contra homologação** (`tools/testar-chamados-ponta-a-ponta.js`,
`ALVO=staging` obrigatório): ciclo inteiro — abrir, responder como suporte,
conferir não lido, encaminhar, resolver, reabrir dentro e fora da janela — mais
isolamento com uma segunda família, upload e leitura de anexo de verdade, e a
**numeração concorrente** (N criações disparadas em paralelo, conferindo N
números distintos e o contador sem buraco).

## O que NÃO entra

- Resposta por e-mail (o sistema nunca lê caixa de entrada)
- Chamado de visitante não logado
- Prioridade escolhida pelo cliente
- SLA, métrica de tempo de resposta, satisfação
- Central de ajuda com artigos — é a etapa 3
- Permissões por papel — é a etapa 2; aqui o papel é só um campo
- Criar/desativar operador pela tela — etapa 2; aqui é o script

## Dívidas registradas (não fazer agora)

| dívida | gatilho para pagar |
|---|---|
| Outbox com retry e backoff para notificação | volume que faça a baixa manual incomodar |
| Instância Evolution própria da plataforma | equipe atendendo, ou o canal do operador virar gargalo |
| Mensagens em coleção própria + índice composto | chamado passando de 200 mensagens ou 700 KB |
| Fila com índice composto e cursor | fila batendo o teto de 200 |
| Caixa `@revelacash.com.br` de verdade | etapa 2, quando houver equipe |

## Impacto em arquivos existentes

| arquivo | mudança |
|---|---|
| `src/data/escopo.js` | `supportTickets` em `COLECOES_ESCOPADAS`; métodos `criarEmTransacao` e `atualizarAtomico` |
| `src/data/escopo.test.mjs` | cobertura de vazamento para os dois métodos novos |
| `src/middlewares/operador.js` | **novo** — `apenasOperadorAtivo` |
| `src/middlewares/admin.js` | inalterado |
| `src/routes/chamados.js` | **novo** — rotas do cliente |
| `src/routes/chamadosOperador.js` | **novo** — fila e atendimento |
| `src/services/chamadoService.js` | **novo** — escopado, lado do cliente |
| `src/services/chamadosPlataformaService.js` | **novo** — cross-tenant, único lugar com `db` cru |
| `src/services/emailService.js` | **novo** — Resend |
| `src/services/notificacaoChamadoService.js` | **novo** — orquestra e-mail + WhatsApp, registra falha |
| `src/services/anexoService.js` | **novo** — Storage, magic bytes, leitura dos bytes pela API |
| `frontend/src/components/lgpd/MeusDados.jsx` | botão "Baixar anexos dos chamados" |
| `src/utils/tipoDeArquivo.js` | **novo** — magic bytes, sem dependência |
| `src/services/lgpdService.js` | export inclui chamados; apagar inclui `supportTickets` e Storage; `executarExclusoesPendentes` |
| `src/app.js` | `express.json` de 8mb em `/suporte/anexos`; `/plataforma/chamados` **antes** de `/plataforma` |
| `index.js` | `executarExclusoes` chama dois serviços, try/catch cada; `RESEND_API_KEY` na lista de secrets |
| `tools/criar-login-operador.js` | passa a criar `operadores/{uid}` |
| `tools/testar-chamados-ponta-a-ponta.js` | **novo** |
| `firebase.json` | seção `storage` |
| `storage.rules` | **novo** — nega tudo |
| `frontend/src/App.jsx` | rotas `/suporte` e `/suporte/:numero` |
| `frontend/src/components/layout/Sidebar.jsx` | item Suporte |
| `frontend/src/pages/LandingPage.jsx` | saída na seção `#duvidas` |
| `frontend/src/pages/AdminPage.jsx` | aba Chamados |
| `frontend/src/pages/plataforma/ChamadosTab.jsx` | **novo** |
| `frontend/src/pages/SuportePage.jsx`, `ChamadoPage.jsx` | **novos** |

`firestore.rules` e `firestore.indexes.json` **não mudam** — não há query nova
que exija índice, e o frontend não fala com o Firestore.

## Dependências externas

| o que | quem resolve | como |
|---|---|---|
| Conta no Resend | Kirk | cadastro |
| SPF + DKIM no registro.br | Kirk | colar 3 registros — ou eu, se o DNS for delegado à Vercel |
| `RESEND_API_KEY` no Secret Manager | eu | `firebase functions:secrets:set` |
| **Storage no projeto de HOMOLOGAÇÃO** | eu (API) ou Kirk (1 clique) | o bucket de `revelacash-staging` **não existe** — conferido. O Firebase CLI não cria bucket; sai pela Management API ou pelo Console. **Sem isso não dá para testar anexo em homologação, e a regra 17 proíbe estrear em produção** |
| Storage em produção | já resolvido | `financeiropessoal-29b32.firebasestorage.app` existe — conferido |
| ~~IAM: Service Account Token Creator~~ | **não é mais necessária** | caiu com a decisão de servir o anexo pela API. Era a única dependência que falhava em runtime e dava falso positivo em teste local |
| `SUPORTE_EMAIL_DESTINO`, `SUPORTE_EMAIL_REMETENTE`, `SUPORTE_WHATSAPP_HOUSEHOLD_ID` | eu | `.env` dos dois projetos |

## O que foi conferido no código

As quatro perguntas que você mandou verificar antes de fechar a spec:

**1. O painel do cliente lê o Firestore direto ou pela API Express?**
Só pela API. `firestore.rules` nega tudo (`allow read, write: if false`) e o
frontend nem importa `firebase/firestore` — `frontend/src/config/firebase.js` só
inicializa Auth e App Check, e `services/api.js` é o único caminho de dados.
**Consequência: não há regra de segurança do Firestore a escrever** para
`supportTickets`, `operadores` ou `counters`. Mas **há regra de Storage a
escrever**, e essa é urgente: o arquivo `storage.rules` não existe no
repositório, então o bucket ficaria no padrão do Firebase — leitura e escrita
para qualquer usuário autenticado, e todo cliente do RevelaCash é autenticado.

**2. O login do operador é mesmo Firebase Auth?**
É. `tools/criar-login-operador.js` chama `admin.auth().createUser()` com o
e-mail interno `@operador.revelacash.internal`. Então existe uid, e
`operadores/{uid}` funciona. O que o painel gestor tem de próprio é a **tela** de
login (usuário/senha, fora do `AuthContext` da família — regra 11), não o
provedor de identidade.

**3. Como as instâncias da Evolution API estão organizadas?**
Uma por família: `fam-<householdId>`, criadas pelo sistema num servidor central
do operador (`EVOLUTION_SERVER_URL` + `EVOLUTION_API_KEY`). Não existe instância
de plataforma. A família #1 (a sua) roda em instância própria legada, com
credencial no documento, e `configEfetiva()` dá precedência a ela. Ver a decisão
em "De qual instância sai o aviso ao operador".

**4. Como `executarExclusoes` está estruturada hoje?**
Inline no `index.js`, linhas 67-85: chama `familiasParaApagar(new Date())` e
itera com `apagarHousehold`, sem try/catch por item — uma família que falha
derruba as seguintes. A mudança do item 14 corrige isso de passagem, sem
refatorar mais que o necessário e sem tocar no nome exportado.

## O que o código contrariou

Três pontos do seu texto não sobreviveram ao confronto com o repositório:

**a) "reaproveitar o rate limit por família que já existe" (item 16) — ele não
existe.** O de `middlewares/rateLimit.js` é por IP e em memória; o
`limiteMensagensService` é por família mas só entra no caminho do WhatsApp, e
também é em memória. O que existe de "por família e persistente" é o padrão de
contador diário em transação do `limiteIAService`/`limiteChatService` — que
serve para conter custo de IA, não para suporte. Adotado no lugar: teto de 5
chamados abertos por família (naturalmente por família), limite de caracteres, e
o `limiteGeral` por IP que já cobre todas as rotas. Nenhum middleware novo.

**b) "acrescentar mensagem usa `arrayUnion`" (item 6) — o `escopo.js` não tem
como fazer isso hoje.** Nenhum dos oito métodos aceita sentinela ou entra em
transação. Ou o service usa `db` cru para escrever chamado (contornando a
regra 3, no arquivo mais sensível do projeto), ou o escopo ganha os dois métodos
descritos em "Concorrência e atomicidade". **Decidido: o escopo ganha os dois
métodos.**

**c) O item 5 pede "a instância da plataforma", e ela não existe.** O sistema não
tem canal fora de família. A solução desta etapa é o canal da sua própria família
com destino na auto-conversa — que é o que o aviso de cadastro já faz hoje e
atende o requisito de não sair pela instância do cliente. **Decidido: canal da
própria família.** Instância dedicada virou dívida.

**d) O item 4 (IAM para signed URL) deixou de existir.** Ele estava certo
enquanto o desenho previa signed URL: `getSignedUrl` em Cloud Functions v2 falha
sem o papel Service Account Token Creator, e falha em runtime. Com a decisão de
servir o anexo pela API, a dependência sumiu inteira — e junto sumiu o teste que
daria falso positivo local.

E uma descoberta que não estava em nenhum dos lados: **o bucket de Storage de
homologação não existe**. Como a regra 17 manda a feature nascer em homologação,
criar esse bucket é pré-requisito da etapa, não detalhe de infra.

## Decisões tomadas (Kirk, 21/08/2026)

| decisão | escolha | o que ela custa |
|---|---|---|
| **1. De onde sai o aviso de WhatsApp ao operador** | canal da própria família dele, na auto-conversa — mesmo caminho do aviso de cadastro | se ele desconectar o WhatsApp do sistema, o aviso para; o e-mail continua. Instância dedicada virou dívida, para quando houver equipe |
| **2. `escopo.js` ganha `criarEmTransacao` e `atualizarAtomico`** | sim, mexer na portaria | alteração no arquivo mais sensível do projeto, coberta pelos 16 testes de vazamento existentes mais testes novos para os dois métodos, escritos **antes** de qualquer rota usá-los |
| **3. Como o anexo chega ao cliente** | servido pela API, com o Bearer de sempre — **sem signed URL** | o arquivo trafega pela function a cada visualização. Em troca some a dependência de IAM inteira, que era a única que falharia só em produção |

A decisão 3 mudou os itens 4, 11 e 19 do texto de ajustes: não há mais signed
URL em lugar nenhum do desenho, e o export leva metadados mais um botão que
baixa os arquivos de verdade.

Com isso a spec está fechada. **Próximo passo: o plano de implementação.**

## Decisões que não mudam

- chamado só para cliente autenticado; pré-venda continua no WhatsApp
- a conversa inteira vive no sistema; o sistema nunca lê caixa de entrada
- e-mail e WhatsApp são só aviso, sem conteúdo do chamado
- isolamento por `householdId` obrigatório
- anexos passam pelo backend, nunca do navegador direto para o Storage
- chamados e anexos integrados ao export e à exclusão LGPD
- cliente reabre chamado resolvido ao responder, agora com janela de 30 dias
- sem prioridade escolhida pelo cliente
- sem SLA, sem avaliação de atendimento, sem central de ajuda
- permissões detalhadas de ADMIN e ATENDENTE continuam na etapa 2
