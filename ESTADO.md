# Estado do projeto — 08/08/2026 (marca + redesign + landing + onboarding no ar)

Transformação de sistema pessoal em micro-SaaS a R$ 24,90/mês.

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
      no frontend, não há como injetar cartão por script)
- [x] Registrar `revelacash.com.br` — feito 07/08/2026. DNS apontado pra
      Vercel (`A @ 76.76.21.21` e `A www 76.76.21.21`, sem CNAME/nameserver),
      domínio vinculado ao projeto `financeiropessoal` via `vercel domains
      add`, HTTPS emitido automaticamente. `revelacash.com` ainda não
      registrado
- [x] Mockup final do logo — recebido e implementado 08/08/2026 (ver sessão
      abaixo). Era só wordmark; agora tem ícone (balão de chat + lupa com
      gráfico, metade roxa/metade verde) em várias variantes
- [ ] Fotos reais para a landing (banco licenciado ou próprias — hoje são
      recriações com os tokens do sistema, não screenshot nem foto real)
- [ ] Aplicar para **Meta Verified**, se quiser o canal WhatsApp oficial
      (leva de 2 a 8 semanas)
- [ ] Revisar a landing nova em produção e aprovar, ou pedir ajuste

**Decisão em aberto — qual a próxima frente de trabalho:**
1. Ampliar o parser (casos que ainda caem na IA por engano)
2. Convite de membro com login próprio (hoje um 2º login vira outra família)
3. Fechar o resto da Fase 4 — orçamento por categoria, contas recorrentes,
   fatura de cartão, áudio transcrito e foto de cupom (OCR)
4. Tutorial de primeiro uso (Kirk pediu pra deixar por último; o tour
   guiado interativo já existe — isto seria material escrito/vídeo à parte)

**Dívidas técnicas conhecidas, sem prioridade definida** (detalhe no fim do
arquivo, seção "Dívidas conhecidas"): README desatualizado, pasta `backend/`
morta, rate limit só em memória, `cloudApiProvider.js` nunca testado contra
API real, bundle do frontend ~1,27 MB sem code splitting, zero testes
automatizados no frontend, `/admin/metricas` não escala para muitas famílias,
uma instância Evolution por família (limite de VPS não medido).

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

## Decisões já tomadas (não reabrir sem motivo)

| Tema | Decisão | Por quê |
|---|---|---|
| Canal WhatsApp | **Adapter**: Evolution agora, Cloud API oficial depois | Lança rápido sem ficar preso; a Groups API oficial (aberta jun/2026) permite 8 participantes por grupo e 10.000 grupos por número, e o fluxo recebe→confirma custa R$ 0,00. Depende da OBA, que sai via Meta Verified (~R$ 69,90/mês) |
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

**Parser** — `Pagamento cartão 1830` corrigido em 07/08 (falta só o
`firebase deploy` para valer em produção). `Lanche 38,00 crédito` continua
caindo na IA por decisão consciente — "lanche" é categoria, não tipo, e virar
palavra-chave de tipo abriria precedente pra qualquer substantivo de compra.

**Convite de membro com login próprio**
- Quem entra pelo grupo lança pelo WhatsApp, mas não abre o painel. O
  `authService.createOrUpdateProfile` cria uma família NOVA para quem se
  cadastra, então hoje um segundo login vira outra família (e outra cobrança).
  Falta o fluxo de convite ligando conta ao membro já existente

**Fase 4 (restante)**
- Orçamento por categoria com alerta de estouro
- Contas fixas recorrentes com lembrete
- Fatura de cartão de crédito (fechamento e vencimento)
- Áudio transcrito e foto de cupom (OCR) — ambos via Gemini
- Custo escondido: lembrete e alerta são mensagens FORA da janela de 24h do
  WhatsApp, ou seja, template utility pago (~US$ 0,008 a 0,03 cada)

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
- Groups API oficial exige **Official Business Account** (logo, Meta Verified);
  1:1 não exige
- **Grupo não suporta botões nem listas interativas.** Limita confirmação do
  tipo "está certo? [Sim] [Corrigir]"
- Groups API: 8 participantes por grupo, 10.000 grupos por número

## Pendências operacionais do Kirk

- Aplicar para **Meta Verified** se quiser o canal oficial (2 a 8 semanas)

Resolvidos nesta sessão (não repetir): telefone do Johnny conferido (campo
`phone` já correto), vault Obsidian atualizado (`projetos/financeiro.md` e
`sistema/painel.md` já refletem "em-execução"/NO AR), famílias de teste
`TESTUSER587309038995717462` e `TESTUSER8066625080459611528` apagadas.

## Dívidas conhecidas

- `README.md` descreve stack que não existe mais (PostgreSQL/Prisma)
- Pasta `backend/` é legado morto
- Rate limit é em memória, portanto por instância — segura flood trivial,
  não ataque distribuído. App Check resolveria
- `cloudApiProvider.js` está escrito conforme a documentação mas **nunca foi
  exercitado contra a API real**. Tratar como não verificado
- Bundle do frontend em ~985 kB, sem code splitting
- Zero testes no frontend (backend tem 246)
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
