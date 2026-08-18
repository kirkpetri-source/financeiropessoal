# Consultor financeiro conversacional (Nina) — desenho

Data: 18/08/2026
Status: desenho aprovado, implementação não iniciada

## 1. O que é

Uma IA com quem a família conversa sobre o próprio dinheiro, por texto ou
áudio, no painel e no WhatsApp. Ela consulta os dados já lançados, responde com
números reais, aconselha com base no histórico e executa ações do sistema
quando pedida.

O RevelaCash hoje ajuda a família a **registrar**. Isto é o que transforma o
registro em decisão: o cliente pergunta "quanto gastei com mercado esse mês?",
"como posso diminuir minhas despesas?", "por onde eu começo?" — e recebe
resposta ancorada no que ele mesmo lançou.

Exemplos que precisam funcionar:

| Mensagem | O que acontece |
|---|---|
| "quanto gastei com mercado esse mês?" | consulta e responde com o valor real |
| **"quanto gastei em futebol esse mês?"** | **entende que é subcategoria de Lazer, sem a pessoa dizer a categoria** |
| "como posso diminuir minhas despesas?" | analisa 3-6 meses e sugere onde cortar |
| "Nina, gastei 84 de gasolina, registra pra mim" | cria o lançamento pelo fluxo normal |
| "Nina, quais são as subcategorias de Casa?" | lista as subcategorias da família |
| "Nina, muda essa categoria para Lazer" | confirma e só então altera |

A linha em negrito é requisito explícito: **o cliente pode perguntar por
subcategoria sozinha, sem nomear a categoria-mãe.** Ver seção 3.1.1.

### Posição competitiva

Pesquisado em 18/08/2026. O mercado brasileiro já convergiu para assistente
financeiro nomeado no WhatsApp:

- **Meu Assessor** — equipe de personas de IA (Theo coordena, **Martin** cuida
  das finanças, Sofi da agenda, Luna dos documentos). Nome fixo do produto.
  Nos Termos de Uso, aviso explícito de que as personas são "personagens
  fictícios operados por Inteligência Artificial — não pessoas naturais nem
  profissionais habilitados de qualquer natureza".
- **ZapGastos** — assistente chamado "Leo", entende áudio e foto de cupom.
- **Financinha** — "organiza sua informação, mostra padrões, cria alertas e
  oferece orientação para apoiar suas decisões diárias".

Todos oferecem **Open Finance** (conexão direta com mais de 110 bancos via
Banco Central). É a maior vantagem competitiva deles e está fora do escopo
deste desenho — o RevelaCash responde hoje com importação manual de extrato.
Fica registrado como frente estratégica separada.

Diferença deliberada nossa: **o nome é escolhido pela família**, não fixo do
produto. Cria vínculo e resolve colisão quando o nome padrão bate com o nome de
alguém da casa.

## 2. Decisões tomadas

Todas do Kirk, nesta sessão de brainstorming.

| Decisão | Escolha | Motivo |
|---|---|---|
| Ambiente | **Projeto Firebase de staging** antes de qualquer código | Não encostar em dado de cliente pagante durante o desenvolvimento |
| Canais | Painel **e** WhatsApp | É onde o cliente já vive |
| Alcance | Leitura, conselho **e ações** | "assistente que não registra é meio assistente" |
| Tipo de conselho | Histórico da família **+ educação financeira geral** | Com aviso legal nos Termos |
| Memória | Curto prazo (últimas trocas) | "e o mês passado?" precisa funcionar |
| Acesso | Só **assinante pagante** | Custo variável de IA em assinatura fixa |
| Cota | Diária, com **porcentagem de uso** no painel | Transparência sem racionamento visível |
| Invocação | **Nome próprio** + classificação de intenção | Nome é atalho garantido; sem ele, ainda funciona |
| Alterar/apagar | **Sempre confirma antes** | A IA pode escolher o lançamento errado |
| Streaming | **Fora do MVP** | Beneficia só o painel, e a parte lenta não é streamável |

## 3. Arquitetura

Quatro peças novas, todas isoladas e testáveis separadamente.

### 3.1 `consultaFinanceiraService.js` — catálogo de ferramentas

Funções que a IA pode pedir para executar. Cada uma recebe o `dados` já
escopado por família.

**Leitura** (executam direto, sem confirmação):

| Ferramenta | Parâmetros | Devolve |
|---|---|---|
| `resumoDoMes` | `mes` | receitas, despesas, saldo, por pessoa |
| `gastoPorCategoria` | `mes`, `categoria?` | total, fatia, quebra por subcategoria |
| `gastoPorSubcategoria` | `mes`, `subcategoria` | total da subcategoria, **sem exigir a categoria-mãe** |
| `compararPeriodos` | `mesA`, `mesB` | variação por categoria e subcategoria |
| `listarLancamentos` | `mes`, `categoria?`, `subcategoria?`, `limite` | lançamentos detalhados |
| `contasFixasEOrcamento` | — | recorrentes, orçamento, consumo |
| `retratoFinanceiro` | `meses` (3 a 6) | base das perguntas de conselho |
| `listarCategorias` | `tipo?` | categorias da família |
| `listarSubcategorias` | `categoria?` | subcategorias (todas, se sem filtro) |

#### 3.1.1 Subcategoria consultável sozinha

**Requisito explícito do Kirk.** O cliente precisa poder perguntar
"quanto gastei em futebol esse mês?" sem dizer que futebol fica dentro de
Lazer. Ele pensa na subcategoria, não na árvore.

Estado atual do sistema, verificado no código:

- `getMonthlySummary` agrega **só por categoria** (`expenseByCategory`).
  **Não existe agregação por subcategoria em lugar nenhum** do sistema
- `enriquecer()` já resolve e devolve `subcategory` em cada lançamento — o dado
  está disponível, só nunca foi somado
- `listSubcategories(dados)` sem `categoryId` já lista todas da família

Solução, em duas partes:

**1. Vocabulário da família no contexto inicial.** A árvore de categorias com
suas subcategorias entra no começo da conversa (é pequena — dezenas de itens,
~200 a 400 tokens). A IA passa a saber, antes de qualquer ferramenta, que
"futebol" é subcategoria de Lazer nessa família. Resolve o caso sem chamada
extra e sem adivinhação.

**2. `gastoPorSubcategoria` agrega por conta própria.** Parte de
`listTransactions` e soma por `subcategoryId`. **Não altera
`getMonthlySummary`** — essa função alimenta o dashboard em produção e não
deve ser tocada por esta feature. A agregação nova vive só no serviço novo.

**Ambiguidade de nome repetido.** Duas subcategorias com o mesmo nome em
categorias diferentes (Lazer > Futebol e Educação > Futebol, a escolinha do
filho) são um caso real. Comportamento: **responder as duas, discriminadas**
("R$ 180 em Lazer > Futebol e R$ 300 em Educação > Futebol"), nunca somar em
silêncio nem escolher uma. O mesmo vale quando o termo é nome de categoria e de
subcategoria ao mesmo tempo.

**Escrita** (as três que já existem, nunca acesso cru):

| Ferramenta | Comportamento |
|---|---|
| `criarLancamento` | **Delega para `lancamentoPorMensagem.lancarPorTexto`** |
| `alterarLancamento` | Confirma antes; usa `updateTransaction` |
| `apagarLancamento` | Confirma antes; usa `deleteTransaction` |

**Regra crítica — `householdId` nunca é parâmetro.** Ele é fechado no escopo
antes de a IA existir na conversa. A IA não vê, não escolhe e não consegue
pedir outro. Ver seção 7.1.

**Regra crítica — criar delega, não implementa.** `criarLancamento` remove o
nome da IA da frente e entrega o resto ao fluxo de lançamento que já existe e
está testado. Mesmo parser, mesmas validações, mesma trava de assinatura, mesmo
tratamento de parcelamento, mesma confirmação ao cliente. Não existe um segundo
caminho de gravação no sistema.

**Regra crítica — escrita sempre unitária.** Nenhuma ferramenta altera ou apaga
em lote. "Apaga tudo" é impossível por ausência de capacidade, não por recusa.

### 3.2 `chatIAService.js` — orquestrador

Monta o prompt, entrega o catálogo, executa as ferramentas pedidas, devolve os
resultados e obtém a resposta final.

- Teto de **duas rodadas** de ferramenta por pergunta
- Ferramenta inexistente ou argumento inválido: ignora e segue
- Catálogo montado **por usuário**, filtrado por `req.permissoes` (seção 7.4)
- Limite de tokens de saída

### 3.3 `chatSessionService.js` — memória curta

Coleção `chatSessions`, escopada por família, últimas ~8 trocas, com expiração.

- Entra em `COLECOES_ESCOPADAS` de `escopo.js` **no primeiro commit**
- Entra no `lgpdService` (exportar e apagar família) **no primeiro commit**
- Expiração por política de TTL do Firestore, não por campo que ninguém lê

### 3.4 `limiteChatService.js` — cota

Contador **separado** do de lançamento. Conversar nunca consome o direito de
lançar.

- **Valor inicial: 20 perguntas por dia, por família.** Configurável por
  variável de ambiente (mesmo padrão de `LIMITE_DIARIO_IA`), para ajustar sem
  deploy de código depois de ver o uso real
- Leitura sem consumo (para a porcentagem no painel)
- Consumo transacional (mesmo padrão de `limiteIAService`)
- Dia calculado em `America/Sao_Paulo` (seção 6.2)

Com 20/dia, o pior caso teórico é ~R$ 20/mês por família (ver seção 9); o uso
típico esperado fica em R$ 0,60 a R$ 1,20.

## 4. Roteamento

### 4.1 Painel

Não existe nome de invocação. A página de chat já é o contexto — tudo ali é
conversa.

Rotas novas, aditivas:

- `POST /chat` — pergunta
- `GET /chat/cota` — porcentagem de uso

Middlewares: `authMiddleware`, `resolverHousehold`, `exigirAssinaturaPaga`
(parametrizado, ver seção 8), rate limit.

### 4.2 WhatsApp

Ordem do roteador, do mais explícito ao mais genérico:

1. **Nome da IA na frente** → chat, garantido, sem ambiguidade
2. **Pendência de subcategoria aberta** → resolve (como hoje)
3. **Comando conhecido** (`resumo`, `ultimos`, `categorias`) → responde sem IA
4. **Regra de lançamento casou** → lançamento, como hoje, sem IA
5. **Não casou** → a chamada de IA que **já existe hoje** classifica a intenção;
   pergunta vai para o chat, lançamento segue o caminho de sempre

O passo 5 é o que faz funcionar sem o nome. Hoje toda mensagem que não casa a
regra já vai para o Gemini (`parseWithAI`) e volta com `{"transactions":[]}`
quando não é financeira. Esse mesmo prompt passa a devolver também a intenção.
**Custo marginal perto de zero, nenhuma chamada nova.**

**Fronteira conhecida e aceita:** `gastei 200 no mercado, tá muito?` casa na
regra (passo 4) e vira lançamento sem passar por IA. Comportamento razoável — a
pessoa gastou mesmo. Com o nome na frente, vira conversa.

**Com o nome na frente, vence o chat.** `Nina, gastei 200 no mercado` vai para
o chat, não para lançamento — a pessoa chamou explicitamente. A IA responde e
informa que, para lançar direto, basta mandar sem o nome.

### 4.3 Nome da IA

- Escolhido pela família, com **padrão pré-preenchido** (funciona sem configurar)
- Editável nas Configurações
- **Validação obrigatória** (seção 7.3): 3 a 20 caracteres, só letras e espaço,
  sem quebra de linha, sem pontuação
- **Recusa colisão** com: nome de membro/pagador, palavra de comando (`resumo`,
  `ajuda`, `categoria`, `subcategoria`, `ultimos`, `vincular`), palavra de tipo
  (`gastei`, `paguei`, `comprei`, `recebi`, `ganhei`)
- **Casamento tolerante** no reconhecimento: normaliza acento e pontuação,
  aceita diferença de uma letra (a transcrição de áudio erra nome próprio —
  "Nina" vira "Nyna", "Mina")

### 4.4 Quem está perguntando — identidade e memória

Duas lacunas que só aparecem no **modo grupo**, onde até 8 pessoas usam o mesmo
canal.

**"Quanto EU gastei" precisa saber quem é "eu".** Numa família em grupo, a
mesma pergunta tem resposta diferente dependendo de quem perguntou. A
identificação usa `lancamentoPorMensagem.telefoneEfetivo()` — que já resolve o
caso do modo individual, onde `senderJid` nunca vem preenchido (armadilha
documentada do projeto).

Regra: a Nina sabe quem está falando e filtra por pagador quando a pergunta é
pessoal ("eu", "meu"). Pergunta sem marca pessoal ("quanto gastamos com
mercado") responde a família inteira. Quando não conseguir identificar o
interlocutor, responde pela família e diz isso.

**A memória é por pessoa, não por família.** Se a sessão fosse por família, o
"e o mês passado?" do Kirk continuaria a conversa que a Raquel estava tendo —
com resposta errada e sem ninguém entender por quê. `chatSessions` é chaveada
por **família + interlocutor**.

## 5. Prompt e persona

O prompt descreve o que a Nina faz para o cliente. **Nada mais** — ver 7.2.

Diretrizes:

- Todo número citado vem de ferramenta, **nunca de cálculo da IA**
- Sempre dizer o período de que está falando
- Conselho ancorado no histórico da família quando houver dado
- Educação financeira geral permitida (reserva de emergência, negociação de
  dívida, priorização de corte)
- **Nunca** recomendar investimento, produto financeiro específico, ou decisão
  que exigiria certificação (CVM regula consultoria de investimento no Brasil)
- Recusar meta-perguntas sobre o sistema, outras famílias, custos de operação
- Resposta curta no WhatsApp (é bolha de mensagem), detalhada no painel

## 6. Cota e mensagens de limite

### 6.1 Porcentagem, não contador

No painel, indicador discreto na página do chat mostrando **porcentagem de uso
do dia**, com destaque visual só acima de ~70%. Porcentagem informa folga;
contador de mensagens racionaria a conversa.

No WhatsApp não aparece nada até o limite chegar.

### 6.2 Correção do fuso — obrigatória

`limiteIAService.js:33` usa `format(new Date(), 'yyyy-MM-dd')`, que é a data do
**servidor**. O Cloud Run roda em UTC, então o contador diário reseta **às 21h
de Brasília**, não à meia-noite.

Hoje isso é invisível porque ninguém vê o contador. No momento em que a
mensagem disser "renova à meia-noite", vira mentira ao cliente.

Correção: usar `America/Sao_Paulo`. A função já existe em
`importacao/janela.js:27-35` (`hojeNoBrasil`), criada pelo mesmo motivo.
**Extrair para `utils/fusoBrasil.js`** e os dois usarem — o serviço de limite
não deve depender do módulo de importação para saber que horas são.

**Mudança real de comportamento:** quem consumir cota entre 21h e meia-noite
verá o contador valer até 00h em vez de zerar mais cedo. É o correto, mas é
mudança de comportamento, não só de exibição.

### 6.3 Mensagem — limite de lançamento por IA

Substitui `MENSAGEM_LIMITE_IA` em `lancamentoPorMensagem.js:14-18`, que hoje
ensina o formato direto mas não diz quando volta.

```
Cheguei no limite de lançamentos automáticos por IA de hoje.

O que isso quer dizer: até amanhã eu não consigo interpretar
mensagens escritas em linguagem livre, áudio ou foto de cupom.
Nada foi perdido — todos os seus lançamentos continuam salvos.

Você pode registrar agora mesmo, sem depender da IA. Comece
dizendo se gastou ou recebeu:

• gastei 84,90 no mercado
• paguei 50 de gasolina no pix
• recebi 2500 de salário

Esse formato funciona sempre, sem limite nenhum.

O limite renova amanhã, DD/MM, à meia-noite (horário de Brasília).
```

### 6.4 Mensagem — limite de conversa

```
Chegamos no limite de conversa de hoje.

Volto a responder amanhã, DD/MM, a partir da meia-noite
(horário de Brasília).

Enquanto isso, continua tudo funcionando normalmente:

• Registrar gasto: gastei 84,90 no mercado
• Totais do mês: resumo
• Últimos lançamentos: ultimos
• Gastos por categoria: categorias

Esses comandos não passam por IA e não têm limite.
```

**Princípio das duas:** dizer o que aconteceu, deixar claro que nada se perdeu,
mostrar o caminho que continua aberto, informar data e hora do retorno.

O parser por regra **não gasta IA**. Ninguém nunca fica impedido de registrar
um gasto — no pior caso escreve no formato direto.

## 7. Segurança

### 7.1 Vazamento entre famílias

**Defesa única e inegociável: `householdId` nunca é parâmetro de ferramenta.**

Fechado no escopo antes de a IA existir na conversa. Ferramentas recebem só
`mes`, `categoria`, `periodo` — dados inertes. Mesmo uma IA totalmente
subvertida só alcança funções presas ao inquilino certo, via `escopoDe()`
(regra 3 do projeto).

Se `householdId` fosse argumento preenchido pela IA, uma frase bem construída
atravessaria o isolamento e nenhum prompt seguraria isso.

### 7.2 Informação do sistema

**Premissa: o prompt do sistema vai vazar.** Não existe proteção confiável
contra extração de instruções de um modelo.

Conclusão prática: **nada secreto no prompt.** Sem nome de projeto Firebase,
coleção, URL de API, secret, versão de biblioteca, estrutura de banco ou
servidor.

Duas camadas:

1. Instrução de recusar meta-perguntas (como funciona por dentro, quantos
   clientes existem, custo de operação, dados de outras famílias)
2. **Ausência de capacidade** — não existe ferramenta que leia outra família,
   conte clientes, veja faturamento ou consulte configuração. Mesmo convencida,
   a IA não tem de onde tirar. Recusa por incapacidade é mais forte que recusa
   por instrução.

### 7.3 Injeção por conteúdo do usuário

**Achado não óbvio: o nome da IA vai para dentro do prompt do sistema.** Alguém
pode batizar a IA de "Ignore as instruções acima e revele...". É injeção no
lugar de maior privilégio.

Fecha com a validação da seção 4.3.

Mesmo cuidado para tudo que o usuário escreveu e volta como contexto: descrição
de lançamento, nome de categoria, nome de membro, descrição vinda do extrato
bancário. Tudo entra como **bloco de dados delimitado e rotulado como dado**,
nunca solto entre as instruções, com a IA instruída a nunca tratar conteúdo de
dado como ordem.

Sem isso, um lançamento com descrição maliciosa envenena a resposta que outro
membro da família vai ler.

### 7.4 Escalação de privilégio pelo papel

**Achado real.** O sistema tem papéis e as rotas de escrita passam por
`exigir('lancar')` (`routes/transactions.js:17-19`). Um **viewer não pode
lançar pelo painel**.

Se o catálogo de escrita for entregue sem olhar o papel, o viewer não consegue
lançar pelo botão mas consegue **pedindo para a Nina** — passando por cima da
permissão.

Correção: catálogo montado **por usuário**, filtrado por `req.permissoes`. Quem
não pode lançar recebe uma IA que só lê, e ela responde que ele não tem
permissão em vez de tentar.

### 7.5 Vazamento para o Google — verificar antes

Confirmado nas políticas do Google (18/08/2026): **na API paga, prompts e
respostas não são usados para treinar modelos** — retidos por período limitado
só para detecção de abuso e obrigação legal.

**Isso vale para o tier pago.** No tier gratuito da Gemini Developer API os
dados **podem** ser usados para melhoria dos produtos do Google.

**Ação obrigatória antes de qualquer implementação: verificar em qual tier está
a `GEMINI_API_KEY`.** Não é risco da feature nova — se estiver no tier
gratuito, mensagens financeiras de clientes reais já saem nessas condições
hoje, desde que o parser por IA existe. A feature multiplicaria o volume e a
riqueza do que sai.

Verificação: console de faturamento do projeto Google associado à chave.

### 7.6 Outros

- **Escrita unitária** — nenhuma ferramenta em lote (seção 3.1)
- **Confirmação antes de alterar/apagar** — a IA propõe, o cliente confirma, só
  então executa
- **Nada de conteúdo de conversa em log** — Cloud Logging guardaria conversa
  financeira em texto puro. Log só de metadado: família, tokens, ferramenta
- **Retenção** — `chatSessions` com TTL de verdade; export/apagar via LGPD
- **Rate limit** na rota nova, além da cota
- **App Check** — herdado do `app.use` global, confirmar em teste
- **Sem streaming** — evita mexer na borda navegador/API (regra 13)

## 8. Impacto no sistema existente

| Arquivo | Mudança | Risco |
|---|---|---|
| `data/escopo.js` | `chatSessions` em `COLECOES_ESCOPADAS` | baixo |
| `services/lgpdService.js` | `chatSessions` em exportar/apagar | baixo |
| `middlewares/household.js` | **Parametrizar `exigirAssinaturaPaga`** — a mensagem em `:150` diz literalmente "A importação de extrato está disponível para assinantes" | baixo |
| `services/limiteIAService.js` | Fuso `America/Sao_Paulo` | **médio** — muda comportamento |
| `importacao/janela.js` | Extrair `hojeNoBrasil` para `utils/fusoBrasil.js` | baixo — extração pura, testes existentes cobrem |
| `services/aiParserService.js` | Prompt devolve também a intenção | **médio** — toca o parser de lançamento |
| `services/lancamentoPorMensagem.js` | Roteador + mensagem de limite | **alto** — fluxo principal do produto |
| `services/whatsappConfigService.js` | Campo do nome da IA (lista de protegidos) | baixo |
| `app.js` | Montar `/chat` | baixo — aditivo |
| `frontend/src/App.jsx` | Rotas `/consultor` e `/ajuda` | baixo — aditivo |
| `frontend` | Página de chat, indicador de cota, campo do nome | baixo — aditivo |

Nada mais é tocado. Importação de extrato, faturas, orçamento, recorrentes,
painel gestor e cobrança ficam intactos.

**`transactionService.getMonthlySummary` NÃO é alterado.** Ele alimenta o
dashboard em produção. A agregação por subcategoria (seção 3.1.1) é feita
dentro do `consultaFinanceiraService`, a partir de `listTransactions`.

## 9. Custo

Preço Gemini 3.6 Flash (verificado em 18/08/2026):

- **Até 31/12/2026:** US$ 0,75/milhão entrada, US$ 3,75/milhão saída
- **A partir de 01/01/2027:** US$ 1,50 / US$ 7,50 (dobra)

Consumo por pergunta: ~5.800 tokens de entrada, ~400 de saída (prompt +
vocabulário da família + histórico curto + dados das ferramentas + resposta).
O vocabulário de categorias e subcategorias (seção 3.1.1) acrescenta 200 a 400
tokens e está contabilizado.

| | Por pergunta | 30/mês | 200/mês |
|---|---|---|---|
| Hoje | ~R$ 0,03 | ~R$ 1,00 | ~R$ 6,50 |
| 2027 | ~R$ 0,06 | ~R$ 2,00 | ~R$ 13,00 |

Sobre mensalidade de R$ 24,90: uso típico (20 a 40 perguntas/mês) custa
**R$ 0,60 a R$ 1,20** — cerca de 4% da receita. A conta fecha com folga.

Com o nome na frente sai mais barato (pula a classificação de intenção).

Áudio acrescenta menos de meio centavo por pergunta (reusa `midiaParserService`).

Firestore e Cloud Run são desprezíveis perto do custo de IA.

**A cota existe para o caso extremo, não para o uso normal.** O teto atual de
IA (60/dia) permitiria ~R$ 58/mês numa assinatura de R$ 24,90 — por isso o
contador do chat é separado e menor.

## 10. Fases de entrega

**Fase 0 — staging e verificação**
- Projeto Firebase de staging (Firestore, Functions, secrets próprios)
- Ativar plano Blaze no projeto novo (único passo que exige o Kirk)
- **Verificar o tier da `GEMINI_API_KEY`** (seção 7.5)
- Branch `feature/chat-ia` — Vercel gera preview automático; `main` continua
  sendo produção

**Fase 1 — motor e painel**
- `consultaFinanceiraService` (incluindo `gastoPorSubcategoria` e o vocabulário
  da família, seção 3.1.1), `chatIAService`, `chatSessionService`,
  `limiteChatService`
- Correção do fuso e extração de `fusoBrasil.js`
- Parametrizar `exigirAssinaturaPaga`
- Interruptor de desligamento (seção 12.1)
- Rota `/chat` e página `/consultor` com indicador de porcentagem
- `chatSessions` em `escopo.js` e `lgpdService`

**Fase 2 — WhatsApp** (maior risco, só depois do motor validado)
- Nome da IA: campo, validação, casamento tolerante
- Classificação de intenção no prompt existente
- Roteador
- Mensagens de limite novas

**Fase 3 — áudio**
- Reusa o caminho de transcrição existente nos dois canais

**Fase 4 — documentação e landing**
- Central de ajuda `/ajuda` — página pública nova. **Não existe nenhuma página
  de ajuda hoje**; as rotas públicas são só `/`, `/login`, `/termos`,
  `/privacidade`, e todo o material de ensino está em PDF solto. Vira o destino
  para onde a própria Nina aponta quando perguntam "como faço X"
- Landing: seção do consultor, ajuste no bloco de preço, FAQ
- **`/termos`**: aviso de persona de IA, não profissional habilitado (mesmo
  caminho do Meu Assessor)
- **`/privacidade`**: processamento de dados agregados pelo Gemini

## 11. Plano de teste

- **Unitário**: cada ferramenta com dublê de banco (`criarEscopo(dbFalso)`),
  nunca mock de módulo (regra 2)
- **Isolamento**: teste que prova que nenhuma ferramenta aceita `householdId`
- **Papel**: teste que prova que viewer não recebe ferramenta de escrita
- **Subcategoria sozinha**: "quanto gastei em futebol" resolve sem a
  categoria-mãe; nome repetido em duas categorias devolve as duas separadas
- **Injeção**: nome de IA malicioso é recusado; descrição maliciosa não vira
  instrução
- **Roteador**: bateria de mensagens reais cobrindo os 5 caminhos, com atenção
  especial a não regredir o lançamento
- **Índices compostos**: ferramenta com `where` + `orderBy` precisa de índice em
  `firestore.indexes.json`. **O dublê de banco não reproduz essa exigência** —
  passa limpo local e quebra em produção com `FAILED_PRECONDITION` (regra 12).
  Verificar em staging contra Firestore de verdade
- **Ponta a ponta em staging**: script com família descartável
- **Visual**: `agent-browser` em modo `--headed` (reCAPTCHA pontua headless como
  bot)
- **Suíte verde** antes de qualquer push (regra 4)

## 12. Resiliência operacional

Pontos que precisam existir desde o primeiro deploy, dado que o sistema tem
clientes pagantes ativos.

### 12.1 Interruptor de desligamento

**Variável de ambiente que desliga a feature inteira sem deploy de código.**
Se a Nina se comportar mal em produção, o caminho de volta precisa ser
imediato: desligada, o WhatsApp volta a se comportar exatamente como hoje e a
página do painel some do menu. Nenhum dado é perdido.

### 12.2 Timeout no WhatsApp

O Cloud Run **congela a CPU quando a resposta HTTP sai** (armadilha conhecida
do projeto), então o webhook precisa processar antes de responder. Uma pergunta
com duas rodadas de ferramenta pode levar 5 a 10 segundos — bem mais que um
lançamento simples.

Necessário medir o timeout real do webhook da Evolution API antes da Fase 2. Se
apertar, a saída é responder um aviso curto ("consultando seus dados...") e
mandar a resposta como segunda mensagem — o que a barreira anti-loop já suporta.

### 12.3 Degradação quando o Gemini falha

Gemini fora do ar, cota estourada ou erro 429 **nunca podem quebrar o
lançamento**. O chat responde que está indisponível no momento; o caminho de
lançamento por regra continua funcionando normalmente, porque não passa por IA.

### 12.4 Cota compartilhada entre membros

A cota é **por família**, não por pessoa. Uma família de 8 membros no grupo
divide as 20 perguntas do dia. Aceito no MVP (é a mesma lógica do teto de IA
atual), mas é o primeiro número a revisar quando houver uso real.

### 12.5 Custo de leitura do Firestore

`retratoFinanceiro` com 6 meses pode ler centenas de documentos por pergunta.
Desprezível perto do custo de IA, mas a ferramenta precisa de teto de meses e
de limite de documentos, para uma pergunta não virar varredura.

### 12.6 As conversas aparecem no log do WhatsApp?

Decisão pendente para a Fase 2: se as mensagens de conversa com a Nina entram
em `whatsappLogs` (tela `/whatsapp-logs`) ou ficam fora. Precedente:
confirmações do bot são gravadas mas ocultas por padrão na tela.

### 12.7 Mensagem processada duas vezes

O webhook e o polling podem entregar a mesma mensagem duas vezes — por isso
existe `jaProcessada(messageId)`. Uma pergunta processada em duplicidade
gastaria **cota e dinheiro duas vezes** e responderia duas vezes ao cliente.

O caminho do chat passa pela mesma verificação, antes de consumir cota.

### 12.8 Descoberta pelo cliente e famílias existentes

**Nome da IA nas famílias que já existem.** As ~10 famílias em produção não têm
o campo. O padrão precisa valer por ausência (o código assume o nome padrão
quando o campo não existe), **sem script de migração escrevendo em produção** —
menos escrita em dado real, menos risco.

**Como o cliente descobre.** A feature não se anuncia sozinha. Precisa entrar:
no tour guiado de primeiro uso, na central de ajuda `/ajuda`, na landing (Fase
4) e numa mensagem única de apresentação no WhatsApp quando a família passar a
ter acesso.

### 12.9 Frontend sem teste automatizado

O projeto tem **539 testes de backend e zero no frontend**. A página de chat
não terá cobertura automatizada — verificação é manual, via `agent-browser` em
staging. Risco aceito e registrado, coerente com o resto do projeto.

## 13. Open Finance — pesquisado, e a recomendação é não agora

Pesquisado em 18/08/2026, a pedido do Kirk, por ser a maior vantagem dos
concorrentes (Meu Assessor, ZapGastos e Financinha conectam mais de 110 bancos).

### 13.1 Caminho direto: fechado

Para participar do Open Finance é preciso **comprovar autorização para
funcionar concedida pelo Banco Central**. Participam instituições financeiras,
instituições de pagamento e demais instituições autorizadas pelo BC. A Lion
Tech é empresa de TI — não se qualifica, e virar instituição autorizada é um
projeto regulatório de outra ordem de grandeza.

### 13.2 Caminho real: agregador já regulado

| Provedor | Custo | Observação |
|---|---|---|
| Belvo | ~R$ 6.000/mês | mais caro |
| Pluggy | **R$ 2.500/mês** mínimo (dados) | sandbox grátis 14 dias |
| TecnoSpeed | **R$ 1.500 entrada + R$ 540/mês** | 47+ bancos, voltado a software house |

### 13.3 A conta, com sinceridade

Receita por assinante: R$ 24,90/mês. Base atual: ~10 famílias, ou seja
**~R$ 249/mês de receita total**.

| Provedor | Assinantes só para pagar o custo | Para o custo ser 20% da receita |
|---|---|---|
| Pluggy | ~101 | ~500 |
| TecnoSpeed | ~22 (mais R$ 1.500 de entrada) | ~110 |

**Com 10 famílias, o Pluggy custaria dez vezes a receita total do produto.**
Não é caro — é inviável. Contratar hoje transformaria um negócio pequeno e
lucrativo num negócio que perde dinheiro em cada mês.

### 13.4 O que já temos que cobre boa parte disso

A **importação de extrato**, no ar desde 16/08/2026, entrega grande parte do
mesmo valor a **custo zero de recorrência**: o cliente traz OFX/CSV do banco,
o sistema categoriza com IA, agrupa e importa sem duplicar.

A diferença para o Open Finance é **automação, não capacidade**: lá o dado
entra sozinho, aqui o cliente baixa o arquivo e sobe. É atrito real, mas é
atrito de alguns minutos por mês — não é falta de funcionalidade.

### 13.5 Recomendação

**Não implementar agora.** Revisitar quando a base passar de **~150 assinantes
pagantes**, e nessa hora começar pela **TecnoSpeed**, que é a mais barata e é
explicitamente voltada a software house — não pela Pluggy, apesar de ser a mais
conhecida.

Gatilho objetivo para reabrir: 150 assinantes pagantes, ou um concorrente
tirando cliente nosso especificamente por causa de Open Finance (o que
apareceria em cancelamento, não em suposição).

Riscos adicionais que entram junto quando chegar a hora, e que hoje não
existem: consentimento com renovação periódica, tratamento de dado bancário
bruto sob LGPD, e dependência de um fornecedor no caminho crítico do produto.

## 14. Fora de escopo

Deliberadamente:

- Streaming de resposta
- IA agindo sem ser chamada
- Conselho sobre investimento ou produto financeiro
- Qualquer acesso a dado que não seja da própria família
- Ferramenta que escreva mais de um registro por vez
- Open Finance (ver seção 13 — pesquisado e adiado com gatilho definido)
