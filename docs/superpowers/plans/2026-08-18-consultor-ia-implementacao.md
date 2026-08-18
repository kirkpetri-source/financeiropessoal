# Consultor conversacional (Nina) — plano de implementação

Desenho aprovado: [`../specs/2026-08-18-consultor-ia-conversacional-design.md`](../specs/2026-08-18-consultor-ia-conversacional-design.md)
Data: 18/08/2026

## Como usar este plano

Tarefas em ordem. Cada uma tem **pronto quando** — critério objetivo, não
"achei que ficou bom". Nada da fase seguinte começa antes da anterior fechar.

Regras do projeto que valem em toda tarefa:

- Teste antes do código onde couber (TDD)
- `npm test` verde em `functions/` antes de qualquer push (regra 4)
- Nenhum teste toca Firestore de produção — dublê via `criarEscopo(dbFalso)`,
  nunca `vi.mock` de módulo (regra 2)
- Nenhuma query sem tenant (regra 3)
- Trabalho na branch `feature/chat-ia`. **`main` é deploy de produção**

---

## Fase 0 — Ambiente e verificações

Nada de código de feature aqui. Sem isso, o resto acontece perto de dado real.

### 0.1 Verificar o tier da `GEMINI_API_KEY` — BLOQUEANTE

O achado mais urgente do desenho (seção 7.5), e independe da feature: no tier
gratuito da Gemini Developer API, o Google **pode** usar os dados para melhoria
de produto. Se for o caso, mensagens financeiras de clientes reais já saem
nessas condições hoje.

- Conferir no console do Google Cloud se o projeto da chave tem faturamento
  ativo e está em tier pago
- Se estiver no gratuito: migrar para pago **antes de qualquer outra coisa**

**Pronto quando:** confirmado por escrito em qual tier está, e em tier pago.

### 0.2 Projeto Firebase de staging

- Criar projeto (ex.: `revelacash-staging`)
- Ativar plano Blaze — **único passo que exige o Kirk** (cartão)
- Provisionar Firestore, regras (`allow read, write: if false`), índices
- Subir secrets próprios (chave Gemini separada, sem Mercado Pago real)
- Deploy das functions no projeto novo
- Seed de categorias e formas de pagamento padrão

**Pronto quando:** `firebase deploy` roda contra staging e uma família de teste
é criada e apagada por script, sem tocar produção.

### 0.3 Branch e preview

- Criar `feature/chat-ia` a partir de `main`
- Confirmar que o push na branch gera preview no Vercel sem publicar produção

**Pronto quando:** URL de preview responde e `revelacash.com.br` está intocado.

---

## Fase 1 — Motor e painel

### 1.1 `utils/fusoBrasil.js` — extração

- Mover `hojeNoBrasil` de `importacao/janela.js` para `utils/fusoBrasil.js`
- `janela.js` passa a importar de lá (reexporta se preciso)
- Acrescentar `proximaMeiaNoiteBrasil()` para as mensagens de limite

**Pronto quando:** testes de `janela.js` continuam verdes sem alteração.

### 1.2 Corrigir o fuso do contador diário

Ver seção 6.2 do desenho. Muda comportamento real.

- `limiteIAService.js:33` passa a usar `hojeNoBrasil()`
- Teste: contagem às 22h BRT continua no mesmo dia

**Pronto quando:** teste novo prova que o dia vira à meia-noite de Brasília.

### 1.3 Parametrizar `exigirAssinaturaPaga`

Hoje a mensagem em `middlewares/household.js:150` fala de importação de extrato.

- Aceitar mensagem por parâmetro, mantendo a atual como padrão
- Importação continua com o texto de hoje
- Chat passa o seu

**Pronto quando:** testes existentes de importação passam sem mudança.

### 1.4 `consultaFinanceiraService.js` — leitura

Ferramentas da seção 3.1. **`householdId` nunca é parâmetro** — o `dados` já
chega escopado.

Ordem: teste primeiro, uma ferramenta por vez.

- `resumoDoMes`, `gastoPorCategoria`, `gastoPorSubcategoria`,
  `compararPeriodos`, `listarLancamentos`, `contasFixasEOrcamento`,
  `retratoFinanceiro`, `listarCategorias`, `listarSubcategorias`
- `gastoPorSubcategoria` agrega a partir de `listTransactions`.
  **Não alterar `getMonthlySummary`**
- Nome repetido em duas categorias devolve as duas, separadas
- `retratoFinanceiro` com teto de meses e de documentos

**Pronto quando:**
- Teste prova que nenhuma ferramenta aceita `householdId`
- Teste prova "futebol" resolvido sem a categoria-mãe
- Teste prova nome repetido devolvendo os dois, sem somar

### 1.5 `montarVocabulario()` — árvore da família

- Categorias com suas subcategorias, formato compacto
- Entra como bloco de dados delimitado, nunca solto entre instruções

**Pronto quando:** família sem subcategoria gera vocabulário só de categorias,
sem erro.

### 1.6 `chatSessionService.js` — memória

- Coleção `chatSessions`, chaveada por **família + interlocutor** (seção 4.4)
- Últimas ~8 trocas
- Entrar em `COLECOES_ESCOPADAS` de `escopo.js` **nesta tarefa**
- Entrar no `lgpdService` (exportar e apagar) **nesta tarefa**
- TTL do Firestore configurado

**Pronto quando:** teste prova que duas pessoas da mesma família têm sessões
separadas, e que exportar/apagar família leva as conversas junto.

### 1.7 `limiteChatService.js` — cota

- Contador separado, 20/dia, configurável por ambiente
- `consumir()` transacional e `consultar()` sem consumo
- Dia via `hojeNoBrasil()`

**Pronto quando:** teste prova que estourar o chat não afeta o contador de
lançamento, e vice-versa.

### 1.8 `chatIAService.js` — orquestrador

- Prompt de sistema (seção 5) — **nada secreto dentro**
- Catálogo filtrado por `req.permissoes` (seção 7.4)
- Loop de ferramentas com teto de 2 rodadas
- Ferramenta inexistente ou argumento inválido: ignora e segue
- Limite de tokens de saída
- Degradação quando o Gemini falha (seção 12.3)
- **Log só de metadado**, nunca conteúdo de conversa

**Pronto quando:**
- Teste prova que viewer não recebe ferramenta de escrita
- Teste prova que descrição maliciosa em lançamento não vira instrução
- Teste prova que Gemini fora do ar não derruba nada

### 1.9 Interruptor de desligamento

- Variável de ambiente que desliga a feature inteira
- Desligada: rota responde 404, página some do menu, WhatsApp inalterado

**Pronto quando:** teste prova que desligada nenhuma chamada de IA acontece.

### 1.10 Rota `/chat`

- `POST /chat` e `GET /chat/cota`
- Middlewares: `authMiddleware`, `resolverHousehold`,
  `exigirAssinaturaPaga` (parametrizado), rate limit
- Montada em `app.js`

**Pronto quando:** trial recebe 403 `RECURSO_DE_ASSINANTE` (nunca 402 —
regra 16), inadimplente recebe 402.

### 1.11 Página `/consultor`

- Chat com histórico, entrada de texto
- Indicador de **porcentagem** de uso, destaque acima de ~70%
- Progresso por etapa durante a espera ("consultando agosto...")
- Rota com carregamento sob demanda (o bundle já está em ~1,35 MB)
- Seguir a skill `revelacash-design`

**Pronto quando:** verificado em staging com `agent-browser --headed`, console
limpo.

### 1.12 Verificação de ponta a ponta da Fase 1

- Script com família descartável em staging
- Conferir índices compostos contra Firestore de verdade (regra 12 — o dublê
  não reproduz `FAILED_PRECONDITION`)

**Pronto quando:** 17 ou mais cenários passam, incluindo pergunta por
subcategoria sozinha e estouro de cota.

---

## Fase 2 — WhatsApp

Maior risco do projeto: encosta no fluxo principal do produto.

### 2.1 Nome da IA

- Campo em `whatsappConfigs`, na lista de protegidos
  (`whatsappConfigService`) — cliente não configura infraestrutura (regra 9)
- Padrão **por ausência do campo**, sem script de migração (seção 12.8)
- Validação: 3 a 20 caracteres, só letras e espaço, sem quebra de linha
- Recusa colisão com membro/pagador, comando e palavra de tipo
- Casamento tolerante: normaliza acento e pontuação, aceita 1 letra de
  diferença

**Pronto quando:** teste prova que nome com tentativa de injeção é recusado, e
que "Nyna" casa com "Nina".

### 2.2 Classificação de intenção

- `parseWithAI` passa a devolver também a intenção
- **Sem chamada nova** — mesmo prompt, campo a mais
- Compatível com quem já consome a função hoje

**Pronto quando:** todos os testes existentes do parser continuam verdes.

### 2.3 Roteador

Ordem da seção 4.2. Antes de tocar no código, escrever a bateria de mensagens
reais cobrindo os cinco caminhos.

- Nome na frente vence e vai para o chat
- Regra de lançamento casou: lançamento, sem IA, **como hoje**
- Identificação do interlocutor via `telefoneEfetivo` (seção 4.4)
- Passa por `jaProcessada` antes de consumir cota (seção 12.7)

**Pronto quando:** a bateria passa inteira, com atenção especial a nenhum
lançamento existente mudar de comportamento.

### 2.4 Mensagens de limite

- Substituir `MENSAGEM_LIMITE_IA` pelo texto da seção 6.3
- Mensagem de limite de conversa, seção 6.4
- Data e hora do retorno via `proximaMeiaNoiteBrasil()`

**Pronto quando:** teste prova a data correta na virada do mês e do ano.

### 2.5 Timeout do webhook

- Medir o tempo real de uma pergunta com duas rodadas de ferramenta
- Se passar do timeout da Evolution: responder aviso curto e mandar a resposta
  como segunda mensagem

**Pronto quando:** medido e registrado; se houver mudança, testada ao vivo.

### 2.6 Verificação ao vivo

Com conta de teste dedicada, **nunca na família Kirk real** — mesmo
procedimento das subcategorias em 11/08.

- Testar nos dois modos, individual e grupo
- Confirmar que a memória não se cruza entre duas pessoas do grupo
- Confirmar "quanto EU gastei" filtrando pela pessoa certa

**Pronto quando:** os dois modos passam e a conta de teste é apagada.

---

## Fase 3 — Áudio

### 3.1 Áudio nos dois canais

- WhatsApp: reusa `midiaParserService.transcreverAudio`
- Painel: gravação no navegador, transcrição pelo mesmo caminho
- Casamento tolerante do nome cobre erro de transcrição (2.1)

**Pronto quando:** áudio real com o nome da IA falado é roteado para o chat.

---

## Fase 4 — Documentação e landing

Só depois de tudo testado e no ar.

### 4.1 Central de ajuda `/ajuda`

Página pública nova — **não existe nenhuma hoje**.

- Como lançar, comandos, subcategorias, importação de extrato, a Nina
- Destino para onde a própria Nina aponta em "como faço X"

### 4.2 Termos e privacidade

- `/termos`: persona de IA, não profissional habilitado
- `/privacidade`: processamento de dados agregados pelo Gemini

**Pronto quando:** revisado e publicado.

### 4.3 Landing

- Seção do consultor, ajuste no bloco de preço, FAQ
- `npm run build` + navegador antes do push — **push é deploy**

### 4.4 Apresentação aos clientes

- Mensagem única no WhatsApp quando a família ganhar acesso
- Passo no tour guiado
- **`TourContext` só pode auto-iniciar partindo do `/dashboard`**

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

Backend em produção **antes** do frontend — a tela nova chamando rota que não
existe quebra; o contrário só deixa a rota ociosa.

## O que fica pronto para o Kirk decidir

- Ligar a feature para as famílias reais (interruptor, tarefa 1.9)
- Ajustar a cota depois de ver uso real
- Reabrir Open Finance em ~150 assinantes (seção 13 do desenho)
