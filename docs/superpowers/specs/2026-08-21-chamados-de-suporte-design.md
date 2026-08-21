# Chamados de suporte — desenho

**Data:** 21/08/2026
**Etapa:** 1 de 3 da Fase 4 (chamados → papéis de operador → central de ajuda)

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

**Quem enxerga é o dono da conta.** Hoje existe UM login por família — membro
de WhatsApp é `wa-<telefone>` e não tem senha. Quando existir convite de membro
com login próprio (pendência antiga do projeto), esta decisão se revisita.

**Aviso não carrega conteúdo.** Nem no WhatsApp, nem no e-mail. A notificação
diz que o chamado #N teve atualização e leva o link. A conversa inteira mora no
sistema, e é lá que se lê e responde. Isso mantém o histórico num lugar só e
evita espalhar assunto de suporte por canal externo.

**Documento único, mensagens dentro dele.** `escopoDe()` opera em coleções raiz
com `householdId` e é ele que impede query sem tenant (regra 3). Subcoleção não
passa por essa barreira e seria a primeira do sistema fora dela. Um chamado de
suporte tem dezenas de mensagens, não milhares — o limite de 1 MB por documento
não aperta com anexo guardado por URL.

**Sem prioridade na primeira versão.** Se o cliente escolhe, tudo vira urgente e
o campo deixa de informar. A fila ordena por quem espera há mais tempo.

## Modelo de dados

### `supportTickets` (coleção raiz, escopada)

| campo | tipo | observação |
|---|---|---|
| `householdId` | string | carimbado pelo `escopoDe`, como em toda coleção escopada |
| `numero` | number | identificador legível e global ("chamado #42") |
| `assunto` | string | uma linha, escrita pelo cliente |
| `categoria` | enum | `DUVIDA` · `PROBLEMA` · `COBRANCA` · `SUGESTAO` |
| `status` | enum | `ABERTO` · `EM_ANDAMENTO` · `AGUARDANDO_CLIENTE` · `RESOLVIDO` |
| `mensagens` | array | `{ autor, autorNome, texto, anexos[], em }`; `autor` é `CLIENTE` ou `SUPORTE` |
| `naoLidoPeloCliente` | boolean | acende o indicador no painel do cliente |
| `naoLidoPeloOperador` | boolean | acende o indicador na fila |
| `abertoPor` | `{ uid, nome }` | quem abriu |
| `atribuidoA` | string \| null | uid do operador responsável |
| `atribuidoEm` | timestamp \| null | quando foi encaminhado |
| `ultimaMensagemEm` | timestamp | ordena a fila |
| `resolvidoEm` | timestamp \| null | |

`numero` vem de um contador atômico em `counters/supportTickets`, incrementado
dentro de uma transação. Contar documentos para descobrir o próximo número tem
corrida — dois chamados simultâneos receberiam o mesmo. É a mesma lição do log
de mensagem do WhatsApp (regra 23).

A coleção entra em `COLECOES_ESCOPADAS` no `escopo.js`, no export da LGPD e na
lista de coleções apagadas junto com a família.

### `operadores` (coleção raiz, NÃO escopada)

Existe porque encaminhar exige um "para quem", e hoje o `/plataforma` só sabe
dizer sim ou não para admin — sem nome, sem lista, sem destinatário possível.

| campo | tipo | observação |
|---|---|---|
| `uid` | string | id do doc; é o uid do Firebase Auth |
| `nome` | string | aparece na fila e no encaminhamento |
| `papel` | enum | `ADMIN` · `ATENDENTE` |
| `ativo` | boolean | desligar sem apagar preserva o histórico de quem atendeu |

Não é escopada de propósito: operador não pertence a família nenhuma. Fica
atrás do `apenasAdmin`, como as outras coleções do painel gestor.

O `tools/criar-login-operador.js`, que já cria o login, passa a criar também
este registro. Nesta etapa o `papel` é apenas informativo — o que cada papel
pode fazer é o desenho da etapa 2.

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
             operador marca resolvido
                       │
                       ▼
                  [RESOLVIDO] ──── cliente responde ──▶ [EM_ANDAMENTO]
```

Quem marca resolvido é o operador, nunca o sistema no meio de uma conversa.
Resolver não esconde nada: o histórico continua visível para o cliente.

Chamado em `AGUARDANDO_CLIENTE` por 15 dias sem resposta é encerrado
automaticamente. O encerramento entra como tarefa dentro da função agendada
`executarExclusoes`, que já roda diariamente — uma agendada nova custaria mais
uma function no deploy para varrer uma coleção pequena. Encerrado por silêncio
também reabre com uma resposta.

Operador respondendo em qualquer estado leva o chamado para
`AGUARDANDO_CLIENTE`; cliente respondendo leva para `EM_ANDAMENTO`. É o que faz
a fila mostrar, sem julgamento humano, de quem é a vez.

## Fluxos

### Cliente

Item novo no Sidebar: **Suporte**, com `/suporte` (lista) e `/suporte/:numero`
(o chamado). A lista mostra status e um ponto no que tem resposta não lida. O
formulário de abertura pede assunto, categoria, descrição e anexos.

O link enviado no aviso aponta direto para `/suporte/:numero`. Com a sessão
expirada, o `PrivateRoute` guarda a rota e o login devolve a pessoa exatamente
ali — comportamento que já existe e é a razão de o link ser direto.

Na landing, a seção de dúvidas (`id="duvidas"`) ganha a saída que hoje não tem:
"Não achou sua resposta? Abrir chamado", que leva ao login e de lá ao painel.

### Operador

Aba nova **Chamados** no `/plataforma`, ao lado de Dashboard, Clientes e
Comunicação. A fila lista todas as famílias, ordenada por quem espera há mais
tempo, com filtro por status. O operador abre, responde, encaminha para outro
operador ativo e marca resolvido.

Toda ação dele grava em `adminAuditLog`: quem fez, em qual família, quando. É o
mesmo rastro das outras ações do painel gestor.

A fila lê todas as famílias — a mesma exceção declarada que o `/plataforma` já
tem, atrás do `apenasAdmin` e em rota separada. Não é proteção nova.

## Notificações

Serviço novo `emailService.js`, com Resend e chave no Secret Manager
(`RESEND_API_KEY`). Falha de envio **nunca** derruba a operação: o chamado é
criado do mesmo jeito e o erro fica no log. É a regra que o
`notificacaoOperadorService` já segue.

| evento | quem recebe | por onde |
|---|---|---|
| chamado novo | equipe | e-mail + WhatsApp do operador |
| suporte respondeu | dono da conta | WhatsApp da família + e-mail |
| cliente respondeu | equipe | e-mail + WhatsApp do operador |
| chamado encaminhado | novo responsável | e-mail |

**Nenhum aviso carrega o texto da mensagem.** O corpo diz que o chamado #N teve
atualização e leva o link. Esta é uma decisão de produto e de privacidade, não
um detalhe de implementação.

Os endereços não ficam no código: `SUPORTE_EMAIL_DESTINO` (caixa da equipe) e
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

## Anexos

Upload passa pela API, não do navegador direto para o Storage. Assim a
autorização fica no mesmo lugar que protege o resto (`escopoDe` dentro do
Express), em vez de virar um segundo conjunto de regras que pode divergir do
primeiro.

- caminho: `chamados/{householdId}/{ticketId}/{arquivo}`
- limite: 5 MB por arquivo
- tipos: PNG, JPG, PDF
- leitura: URL assinada de vida curta, gerada pelo backend a cada visualização

Anexo pode conter dado financeiro — print de extrato, comprovante. Por isso ele
entra na LGPD junto com o resto.

## LGPD

Duas mudanças obrigatórias no `lgpdService`:

1. `apagarFamiliaAgora` passa a apagar os arquivos do Storage da família, além
   dos documentos. Sem isso, sobra dado de cliente depois da exclusão —
   exatamente o que esse serviço existe para impedir.
2. O export passa a incluir os chamados e a lista de anexos.

## Segurança e isolamento

- `supportTickets` é escopada: acesso só por `escopoDe(householdId)`.
- A fila do operador é a exceção já declarada, atrás de `apenasAdmin`, em rota
  separada, com registro em `adminAuditLog`.
- `operadores` não é escopada por natureza e fica atrás de `apenasAdmin`.
- Upload e leitura de anexo passam pelo mesmo escopo do chamado.
- Nenhum aviso externo carrega conteúdo do chamado.

## Testes

**Unidade, com dublê de banco** (nunca mock de módulo — regra 2):

- numeração atômica: dois chamados no mesmo instante recebem números
  diferentes, e o contador não pula
- transições de status, incluindo reabertura por resposta em chamado resolvido
- não lido dos dois lados: quem escreve não acende o próprio indicador
- **isolamento**: família B não enxerga, não responde e não encaminha chamado da
  família A — o teste que mais importa
- falha do e-mail não derruba a criação do chamado

**Ponta a ponta contra homologação** (`tools/testar-chamados-ponta-a-ponta.js`):
ciclo inteiro — abrir, responder como suporte, conferir não lido, encaminhar,
resolver, reabrir — mais a checagem de isolamento com uma segunda família.

A fila filtra por status e ordena por data. `where` + `orderBy` em campos
diferentes exigiria índice composto, que o dublê dos testes não reproduz
(regra 12): a fila é pequena, então filtra no Firestore e ordena em memória,
como o `adminAuditService` já faz.

## O que NÃO entra

- Resposta por e-mail (o sistema nunca lê caixa de entrada)
- Chamado de visitante não logado
- Prioridade escolhida pelo cliente
- SLA, métrica de tempo de resposta, satisfação
- Central de ajuda com artigos — é a etapa 3
- Permissões por papel — é a etapa 2; aqui o papel é só um campo

## Impacto em arquivos existentes

| arquivo | mudança |
|---|---|
| `src/data/escopo.js` | `supportTickets` em `COLECOES_ESCOPADAS` |
| `src/services/lgpdService.js` | export inclui chamados; apagar inclui Storage |
| `src/routes/` | rota nova de chamados (cliente) e endpoints na rota admin |
| `src/middlewares/admin.js` | inalterado; `operadores` fica atrás dele |
| `tools/criar-login-operador.js` | passa a criar o registro em `operadores` |
| `frontend/src/App.jsx` | rotas `/suporte` e `/suporte/:numero` |
| `frontend/src/components/layout/Sidebar.jsx` | item Suporte |
| `frontend/src/pages/LandingPage.jsx` | saída na seção de dúvidas |
| `frontend/src/pages/plataforma/` | aba Chamados |
| `firebase.json` / regras do Storage | bucket de anexos fechado para acesso direto |

## Dependências externas

| o que | quem resolve |
|---|---|
| Conta no Resend | Kirk (cadastro) |
| SPF + DKIM no registro.br | Kirk, colando 3 registros — ou eu, se o DNS for delegado à Vercel |
| `RESEND_API_KEY` no Secret Manager | eu, por CLI |
| Firebase Storage habilitado no projeto | eu, por CLI |
