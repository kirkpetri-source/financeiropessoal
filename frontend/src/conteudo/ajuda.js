import {
  Rocket, MessageSquare, Tag, Upload, Sparkles, CreditCard, ShieldCheck, Wrench,
} from 'lucide-react';

/**
 * Conteúdo da central de ajuda.
 *
 * Mora em dado, e não em JSX espalhado por várias páginas, por três motivos:
 * a busca precisa varrer o texto inteiro (impossível se o texto estiver dentro
 * de componentes), o índice e os "veja também" precisam saber o que existe, e
 * escrever um artigo novo tem que ser acrescentar um objeto — não montar mais
 * uma página.
 *
 * REGRA DE CONTEÚDO: nada aqui pode descrever comportamento que o sistema não
 * tem. Cada afirmação sobre lançamento, comando, limite ou cobrança foi
 * conferida contra o código em 22/08/2026 (`comandosWhatsapp.js`,
 * `financialParser.js`, `importacao/janela.js`, `limiteChatService.js`,
 * `assinaturaService.js`). Documentação que promete o que o produto não faz
 * gera chamado, e chamado é o que esta página existe para evitar.
 *
 * Blocos aceitos pelo renderizador (`AjudaPage.jsx`):
 *   { t: 'p',        texto }
 *   { t: 'sub',      texto }
 *   { t: 'lista',    itens: [] }
 *   { t: 'passos',   itens: [] }
 *   { t: 'exemplos', itens: [] }   mensagens de WhatsApp, em monoespaçada
 *   { t: 'atencao',  texto }
 *   { t: 'tabela',   colunas: [], linhas: [[]] }
 */

export const TEMAS = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    descricao: 'Criar a conta, conectar o WhatsApp e colocar a família para lançar.',
    icone: Rocket,
  },
  {
    id: 'lancar',
    titulo: 'Lançar gastos',
    descricao: 'Por texto, por áudio ou por foto do cupom — e como corrigir.',
    icone: MessageSquare,
  },
  {
    id: 'organizar',
    titulo: 'Organizar',
    descricao: 'Categorias, subcategorias, orçamento, contas fixas e faturas.',
    icone: Tag,
  },
  {
    id: 'importar',
    titulo: 'Importar extrato',
    descricao: 'Subir o arquivo do banco e trazer o mês inteiro de uma vez.',
    icone: Upload,
  },
  {
    id: 'assistente',
    titulo: 'Assistente',
    descricao: 'Perguntar sobre os próprios números e receber resposta em conversa.',
    icone: Sparkles,
  },
  {
    id: 'assinatura',
    titulo: 'Assinatura',
    descricao: 'Preço, teste grátis, pagamento e cancelamento.',
    icone: CreditCard,
  },
  {
    id: 'conta-e-dados',
    titulo: 'Conta e dados',
    descricao: 'Senha, quem enxerga o quê, exportar e apagar seus dados.',
    icone: ShieldCheck,
  },
  {
    id: 'problemas',
    titulo: 'Quando algo não funciona',
    descricao: 'O que checar antes de abrir um chamado.',
    icone: Wrench,
  },
];

export const ARTIGOS = [
  // ─────────────────────────────────────────────── primeiros passos
  {
    slug: 'criar-conta',
    tema: 'primeiros-passos',
    titulo: 'Criar a conta e a sua família',
    resumo: 'A conta é sua; a família é o espaço onde os lançamentos vivem.',
    busca: 'cadastro criar conta email senha familia comecar',
    blocos: [
      { t: 'p', texto: 'No RevelaCash, tudo gira em torno da FAMÍLIA. É ela que guarda os lançamentos, as categorias e o histórico — e é ela que tem a assinatura. Quando você se cadastra, uma família é criada automaticamente com você como titular.' },
      { t: 'passos', itens: [
        'Abra revelacash.com.br e clique em "Começar grátis".',
        'Informe nome, e-mail e uma senha de pelo menos 10 caracteres, com letra e número.',
        'Pronto: a conta está criada e o teste de 7 dias começa na hora, sem cartão.',
      ] },
      { t: 'p', texto: 'Você recebe um e-mail para confirmar o endereço. Ele não bloqueia o uso — serve para conseguirmos falar com você se precisar recuperar a senha.' },
      { t: 'atencao', texto: 'Um segundo cadastro com outro e-mail cria uma família NOVA, separada, e não entra na sua. Para lançar junto com quem mora com você, use o modo em família na conexão do WhatsApp.' },
    ],
    veja: ['conectar-whatsapp', 'preco-e-teste'],
  },
  {
    slug: 'conectar-whatsapp',
    tema: 'primeiros-passos',
    titulo: 'Conectar o WhatsApp',
    resumo: 'Escolha entre lançar sozinho ou em família, e conecte por QR Code ou por código.',
    busca: 'whatsapp conectar qr code codigo pareamento grupo individual conexao',
    blocos: [
      { t: 'p', texto: 'O lançamento por mensagem só funciona depois de conectar o seu WhatsApp. Isso é feito uma vez, em Configurações → WhatsApp.' },
      { t: 'sub', texto: 'Antes de conectar: escolha o modo' },
      { t: 'lista', itens: [
        'Só eu vou lançar — as mensagens vão para a sua própria conversa (o chat "Mensagens para mim"). Nada muda no seu WhatsApp, ninguém mais vê.',
        'Minha família vai lançar junto — criamos um grupo no seu WhatsApp com quem você cadastrar. Cada pessoa manda os gastos dela e o painel mostra separado por pessoa.',
      ] },
      { t: 'atencao', texto: 'No modo em família, cadastre os participantes ANTES de conectar. O WhatsApp não cria grupo de uma pessoa só — é preciso pelo menos mais alguém.' },
      { t: 'sub', texto: 'Conectando' },
      { t: 'lista', itens: [
        'Estou em outro aparelho — aparece um QR Code na tela; leia com o celular em WhatsApp → Aparelhos conectados.',
        'Estou neste celular — aparece um código de 8 dígitos para digitar no próprio WhatsApp, sem precisar de um segundo aparelho.',
      ] },
      { t: 'p', texto: 'Se o código expirar antes de você usar, é só pedir outro. Trocar de método também funciona a qualquer momento.' },
    ],
    veja: ['quem-pode-lancar', 'whatsapp-desconectou', 'como-lancar-texto'],
  },
  {
    slug: 'quem-pode-lancar',
    tema: 'primeiros-passos',
    titulo: 'Quem pode lançar pelo WhatsApp',
    resumo: 'Quem lança pelo WhatsApp não precisa de login — o telefone já identifica a pessoa.',
    busca: 'participantes membros familia telefone quem lancou pessoa conjuge filho',
    blocos: [
      { t: 'p', texto: 'Cadastrar um participante é dizer o nome e o WhatsApp dele. A partir daí, tudo que essa pessoa mandar no grupo entra como lançamento dela — sem criar login, sem senha, sem ela precisar abrir o site.' },
      { t: 'p', texto: 'No painel, o resumo do mês mostra quanto cada pessoa gastou, e você pode filtrar os lançamentos por quem lançou.' },
      { t: 'atencao', texto: 'O número precisa estar completo: DDD + 9 + os oito dígitos, 11 no total. Sem o 9, o WhatsApp entende como outro número e o gasto fica sem dono.' },
      { t: 'p', texto: 'Também dá para dizer quem pagou direto na mensagem, citando o nome no fim — útil quando alguém usa o celular de outra pessoa.' },
      { t: 'exemplos', itens: ['gastei 84,90 no mercado raquel'] },
    ],
    veja: ['conectar-whatsapp', 'numero-sem-o-9'],
  },

  // ─────────────────────────────────────────────── lançar
  {
    slug: 'como-lancar-texto',
    tema: 'lancar',
    titulo: 'Como lançar por mensagem',
    resumo: 'Comece dizendo se gastou ou recebeu. O resto pode ser do seu jeito.',
    busca: 'lancar gasto despesa receita mensagem texto gastei paguei recebi como funciona',
    blocos: [
      { t: 'p', texto: 'Não existe formulário nem campo obrigatório. A única coisa que importa é COMEÇAR dizendo se foi dinheiro que saiu ou que entrou.' },
      { t: 'sub', texto: 'Gastos' },
      { t: 'exemplos', itens: [
        'gastei 84,90 no mercado',
        'paguei 50 de gasolina no pix',
        'comprei 1200 de geladeira em 10x',
      ] },
      { t: 'sub', texto: 'Recebimentos' },
      { t: 'exemplos', itens: [
        'recebi 2500 de salário',
        'ganhei 250 de um serviço',
      ] },
      { t: 'atencao', texto: 'Mandar só "mercado 84,90" costuma dar errado: sem o verbo no começo, o sistema não sabe se o dinheiro entrou ou saiu, e pode categorizar diferente do que você esperava.' },
      { t: 'p', texto: 'A resposta chega em segundos, dizendo o que foi registrado e em qual categoria. Se a categoria não for a que você queria, dá para trocar na mensagem seguinte.' },
      { t: 'p', texto: 'Um gasto por mensagem. Se você escrever dois valores na mesma frase ("gastei 30 no mercado e 80 de gasolina"), o sistema separa nos dois lançamentos — mas a forma mais confiável continua sendo uma mensagem para cada.' },
    ],
    veja: ['comandos-whatsapp', 'corrigir-lancamento', 'lancar-por-audio'],
  },
  {
    slug: 'lancar-por-audio',
    tema: 'lancar',
    titulo: 'Lançar falando',
    resumo: 'Grave um áudio no WhatsApp. A transcrição e o registro são automáticos.',
    busca: 'audio voz falar gravar transcricao microfone',
    blocos: [
      { t: 'p', texto: 'Mande um áudio no lugar do texto, falando exatamente como escreveria. Vale a mesma regra: comece dizendo se gastou ou recebeu.' },
      { t: 'exemplos', itens: ['"gastei quarenta e cinco reais no almoço"'] },
      { t: 'p', texto: 'O áudio também serve para PERGUNTAR, não só para lançar — se a assistente estiver liberada para a sua família, dá para falar uma pergunta e receber a resposta escrita.' },
      { t: 'atencao', texto: 'Ao falar centavos, diga o valor de uma vez ("quatro reais e cinquenta"). Falar picotado aumenta a chance de a transcrição entender dois números soltos.' },
      { t: 'p', texto: 'Confira sempre a confirmação que chega. Se o valor saiu errado, apague e mande de novo — é uma mensagem só.' },
    ],
    veja: ['corrigir-lancamento', 'valor-errado-no-audio'],
  },
  {
    slug: 'lancar-por-foto',
    tema: 'lancar',
    titulo: 'Fotografar o cupom',
    resumo: 'Uma foto da nota fiscal vira lançamento sem você digitar nada.',
    busca: 'foto imagem cupom nota fiscal comprovante camera recibo',
    blocos: [
      { t: 'p', texto: 'Tire a foto do cupom e mande no mesmo lugar onde você lança. O valor total e o estabelecimento são lidos da imagem.' },
      { t: 'lista', itens: [
        'Enquadre o cupom inteiro, principalmente a linha do total.',
        'Evite sombra sobre o papel e foto muito inclinada.',
        'Cupom amassado ou desbotado pode sair com valor errado — confira a confirmação.',
      ] },
      { t: 'p', texto: 'Serve também para comprovante de Pix e print de compra, desde que o valor apareça de forma legível.' },
    ],
    veja: ['corrigir-lancamento'],
  },
  {
    slug: 'corrigir-lancamento',
    tema: 'lancar',
    titulo: 'Corrigir ou apagar um lançamento',
    resumo: 'Dá para desfazer o último pelo WhatsApp, ou editar qualquer um pelo painel.',
    busca: 'apagar errado corrigir excluir desfazer editar cancelar categoria errada',
    blocos: [
      { t: 'sub', texto: 'Pelo WhatsApp, o último lançamento' },
      { t: 'exemplos', itens: [
        'apagar ultimo',
        'errado',
        'categoria mercado',
        'subcategoria padaria',
      ] },
      { t: 'p', texto: '"apagar ultimo" (ou "errado", "apaga", "cancela") desfaz o que acabou de entrar. "categoria" e "subcategoria" mudam a classificação do último lançamento sem apagá-lo.' },
      { t: 'sub', texto: 'Pelo painel, qualquer lançamento' },
      { t: 'p', texto: 'Em Lançamentos, cada linha pode ser editada ou apagada — valor, data, descrição, categoria, subcategoria, forma de pagamento e quem pagou.' },
    ],
    veja: ['comandos-whatsapp', 'categorias-subcategorias'],
  },
  {
    slug: 'comandos-whatsapp',
    tema: 'lancar',
    titulo: 'Todos os comandos do WhatsApp',
    resumo: 'Palavras que o sistema entende como ordem, não como gasto.',
    busca: 'comandos resumo ultimos ajuda categorias lista palavras',
    blocos: [
      { t: 'p', texto: 'Mande a palavra sozinha, na conversa onde você lança. Digitar "ajuda" no WhatsApp traz esta mesma lista.' },
      { t: 'tabela', colunas: ['Comando', 'O que faz'], linhas: [
        ['resumo', 'Totais do mês: receitas, despesas, saldo e maior gasto'],
        ['ultimos', 'Os últimos lançamentos registrados'],
        ['apagar ultimo', 'Desfaz o último lançamento (também vale errado, apaga, cancela)'],
        ['categoria mercado', 'Muda a categoria do último lançamento'],
        ['subcategoria padaria', 'Muda a subcategoria do último lançamento'],
        ['sem subcategoria', 'Remove a subcategoria do último lançamento'],
        ['categorias', 'As categorias mais usadas no mês'],
        ['ajuda', 'A lista de comandos, no próprio WhatsApp'],
      ] },
      { t: 'atencao', texto: 'Comando não é gasto: "resumo" nunca vira lançamento de R$ 0. Mas uma frase com valor sempre é lida como lançamento — "gastei 45 no mercado" continua sendo gasto mesmo logo depois de um comando.' },
    ],
    veja: ['como-lancar-texto', 'corrigir-lancamento'],
  },

  // ─────────────────────────────────────────────── organizar
  {
    slug: 'categorias-subcategorias',
    tema: 'organizar',
    titulo: 'Categorias e subcategorias',
    resumo: 'A categoria vem pronta; a subcategoria é opcional e você cria quando quiser.',
    busca: 'categoria subcategoria classificar organizar mercado padaria criar',
    blocos: [
      { t: 'p', texto: 'Toda conta nasce com um conjunto de categorias prontas (Mercado, Alimentação, Moradia, Transporte, e por aí). Você pode criar as suas, renomear e escolher a cor em Categorias.' },
      { t: 'sub', texto: 'Subcategoria: um nível a mais, só se você quiser' },
      { t: 'p', texto: 'Dentro de Mercado você pode criar Padaria, Açougue, Hortifruti. Enquanto você não criar nenhuma, nada muda: o sistema não pergunta nada e continua funcionando igual.' },
      { t: 'p', texto: 'Depois de criadas, o lançamento pelo WhatsApp tenta identificar a subcategoria pela descrição. Quando fica em dúvida, pergunta — e a resposta é o número da opção.' },
      { t: 'exemplos', itens: [
        'gastei 32 na padaria',
        'subcategoria padaria',
      ] },
      { t: 'atencao', texto: 'Subcategoria pertence à sua família. Ninguém de fora vê, e ela não aparece para outras contas.' },
    ],
    veja: ['corrigir-lancamento', 'orcamento'],
  },
  {
    slug: 'orcamento',
    tema: 'organizar',
    titulo: 'Orçamento por categoria',
    resumo: 'Um limite mensal por categoria, para saber quando está passando do ponto.',
    busca: 'orcamento limite meta teto categoria mensal',
    blocos: [
      { t: 'p', texto: 'Em Orçamento você define quanto pretende gastar por mês em cada categoria. O painel mostra o quanto já foi consumido e o quanto sobra.' },
      { t: 'p', texto: 'O limite é informativo: nada é bloqueado quando você passa. Ele existe para você enxergar o desvio ainda dentro do mês, não no fim.' },
    ],
    veja: ['categorias-subcategorias', 'contas-fixas'],
  },
  {
    slug: 'contas-fixas',
    tema: 'organizar',
    titulo: 'Contas fixas',
    resumo: 'O que se repete todo mês entra sozinho, no dia certo.',
    busca: 'conta fixa recorrente mensalidade aluguel internet assinatura repetir',
    blocos: [
      { t: 'p', texto: 'Aluguel, internet, escola, streaming: cadastre uma vez em Contas Fixas, com o valor e o dia do vencimento, e o lançamento passa a ser criado automaticamente todo mês.' },
      { t: 'p', texto: 'Também dá para cadastrar pela assistente, no WhatsApp, chamando ela pelo nome.' },
      { t: 'exemplos', itens: ['Nina, cadastra minha internet como conta fixa'] },
      { t: 'p', texto: 'Ela pergunta o valor e o dia, e cadastra com a sua resposta. Alterar valor ou apagar é pelo painel.' },
    ],
    veja: ['o-que-a-nina-faz', 'orcamento'],
  },
  {
    slug: 'cartao-faturas',
    tema: 'organizar',
    titulo: 'Cartão de crédito e faturas',
    resumo: 'Gasto no crédito entra na fatura do ciclo, não no dia da compra.',
    busca: 'cartao credito fatura fechamento vencimento parcelado',
    blocos: [
      { t: 'p', texto: 'Ao cadastrar uma forma de pagamento como cartão de crédito, você informa o dia de fechamento e o de vencimento. A partir daí, cada compra no crédito é somada à fatura do ciclo correspondente.' },
      { t: 'p', texto: 'Em Faturas você vê a fatura aberta (que ainda está sendo formada), as já fechadas e as pagas.' },
      { t: 'p', texto: 'Para lançar no crédito pelo WhatsApp, cite a forma de pagamento na mensagem.' },
      { t: 'exemplos', itens: ['gastei 189 no supermercado no crédito'] },
    ],
    veja: ['como-lancar-texto'],
  },

  // ─────────────────────────────────────────────── importar
  {
    slug: 'importar-extrato',
    tema: 'importar',
    titulo: 'Importar o extrato do banco',
    resumo: 'Suba o arquivo do banco e traga o mês inteiro de uma vez, sem duplicar nada.',
    busca: 'importar extrato ofx csv banco nubank arquivo lote historico',
    blocos: [
      { t: 'p', texto: 'Em Importar extrato você sobe o arquivo que o seu banco exporta (OFX ou CSV), confere na tela o que vai entrar e importa em lote. Serve para trazer o histórico dos meses anteriores sem digitar linha por linha.' },
      { t: 'sub', texto: 'Como funciona' },
      { t: 'passos', itens: [
        'Baixe o extrato no aplicativo do seu banco, em OFX ou CSV.',
        'Suba o arquivo. A tela mostra cada linha lida, já com uma categoria sugerida.',
        'Ajuste as categorias que quiser e confirme.',
        'Se algo saiu errado, desfaça o lote inteiro com um clique.',
      ] },
      { t: 'sub', texto: 'Só mês já fechado' },
      { t: 'p', texto: 'O mês corrente não é oferecido de propósito: é nele que os lançamentos pelo WhatsApp estão entrando, e importar por cima criaria confusão. O mês passa a ficar disponível quando termina.' },
      { t: 'sub', texto: 'Importar o mesmo arquivo duas vezes não duplica' },
      { t: 'p', texto: 'Cada linha do extrato tem uma impressão digital própria. Se você subir o mesmo arquivo de novo, as linhas já importadas são reconhecidas e ficam de fora.' },
      { t: 'atencao', texto: 'A importação exige assinatura ativa e paga. Durante o teste grátis ela não fica disponível.' },
      { t: 'p', texto: 'Quanto mais você importa, melhor fica: o sistema guarda a categoria que você escolheu para cada estabelecimento e sugere sozinho na próxima vez.' },
    ],
    veja: ['preco-e-teste', 'corrigir-lancamento'],
  },

  // ─────────────────────────────────────────────── assistente
  {
    slug: 'o-que-a-nina-faz',
    tema: 'assistente',
    titulo: 'O que a assistente faz',
    resumo: 'Pergunte sobre os seus números em português e receba a resposta em conversa.',
    busca: 'assistente nina ia inteligencia artificial perguntar chat conversar',
    blocos: [
      { t: 'p', texto: 'A assistente responde perguntas sobre os SEUS lançamentos. Ela olha o histórico da sua família e responde com número real, não com estimativa.' },
      { t: 'exemplos', itens: [
        'quanto gastei esse mês?',
        'quanto foi de mercado em junho?',
        'compare julho com junho',
        'onde eu gastei mais essa semana?',
      ] },
      { t: 'p', texto: 'Ela fica em Assistente, no menu do painel. No WhatsApp, é preciso chamá-la pelo nome — assim uma frase comum não vira pergunta sem querer.' },
      { t: 'sub', texto: 'O que ela não faz' },
      { t: 'lista', itens: [
        'Não recomenda investimento, banco, corretora, seguro nem produto financeiro. Isso exige um profissional certificado.',
        'Não enxerga dados de outra família — em nenhuma hipótese.',
        'Não substitui contador nem planejador financeiro.',
      ] },
    ],
    veja: ['falar-com-a-nina-no-whatsapp', 'contas-fixas'],
  },
  {
    slug: 'falar-com-a-nina-no-whatsapp',
    tema: 'assistente',
    titulo: 'Falar com a assistente pelo WhatsApp',
    resumo: 'Chame pelo nome. Sem o nome, a mensagem é lida como lançamento.',
    busca: 'nina whatsapp nome chamar limite cota conversas dia perguntar audio',
    blocos: [
      { t: 'p', texto: 'No WhatsApp, comece a mensagem com o nome da assistente. O nome padrão é Nina, e você pode trocar em Configurações.' },
      { t: 'exemplos', itens: [
        'Nina, quanto gastei em mercado esse mês?',
        'Nina, cadastra minha internet como conta fixa',
      ] },
      { t: 'p', texto: 'Vale por áudio também: fale o nome dela no começo da gravação.' },
      { t: 'sub', texto: 'Limite diário' },
      { t: 'p', texto: 'São 20 conversas por dia, por família. Consultas simples de valor — "quanto gastei esse mês" — são respondidas direto do seu histórico e não consomem esse limite.' },
      { t: 'atencao', texto: 'Se a assistente fizer uma pergunta e você responder logo em seguida, a resposta é entendida como resposta — não vira lançamento. Mas uma frase com valor e verbo de gasto ("gastei 45 no mercado") continua sendo lançamento sempre.' },
    ],
    veja: ['o-que-a-nina-faz', 'como-lancar-texto'],
  },

  // ─────────────────────────────────────────────── assinatura
  {
    slug: 'preco-e-teste',
    tema: 'assinatura',
    titulo: 'Preço e teste grátis',
    resumo: 'R$ 24,90 por mês, por família. Sete dias de teste antes de qualquer cobrança.',
    busca: 'preco valor mensalidade quanto custa teste gratis trial 7 dias',
    blocos: [
      { t: 'p', texto: 'A assinatura é de R$ 24,90 por mês e vale para a FAMÍLIA inteira — não é por pessoa. Todo mundo que lança pelo grupo está coberto pela mesma mensalidade.' },
      { t: 'p', texto: 'O teste grátis dura 7 dias e começa no cadastro. Não pedimos cartão para testar: se você não assinar, nada é cobrado e nada é debitado.' },
      { t: 'atencao', texto: 'A importação de extrato é o único recurso que não entra no teste — ela pede assinatura ativa e paga.' },
    ],
    veja: ['pagamento-e-cancelamento', 'o-que-acontece-se-nao-pagar'],
  },
  {
    slug: 'pagamento-e-cancelamento',
    tema: 'assinatura',
    titulo: 'Pagar e cancelar',
    resumo: 'Assinatura mensal pelo Mercado Pago, cancelável por um botão no painel.',
    busca: 'pagamento cartao mercado pago assinar cancelar cobranca boleto pix',
    blocos: [
      { t: 'p', texto: 'A cobrança é mensal, pelo Mercado Pago. Em Assinatura você assina, vê a data da próxima cobrança e cancela.' },
      { t: 'p', texto: 'Cancelar é um botão no painel: sem ligação, sem falar com atendente, sem multa. O acesso continua até o fim do período já pago.' },
      { t: 'p', texto: 'Nota fiscal e comprovantes de cobrança ficam disponíveis pelo próprio Mercado Pago, com a conta que fez o pagamento.' },
    ],
    veja: ['o-que-acontece-se-nao-pagar', 'preco-e-teste'],
  },
  {
    slug: 'o-que-acontece-se-nao-pagar',
    tema: 'assinatura',
    titulo: 'Se a assinatura ficar inativa',
    resumo: 'Você perde o direito de lançar. Não perde o histórico, nem o acesso a ele.',
    busca: 'atraso inadimplente bloqueio parar de pagar cancelou dados historico',
    blocos: [
      { t: 'p', texto: 'Com a assinatura inativa, novos lançamentos ficam bloqueados — pelo painel e pelo WhatsApp.' },
      { t: 'p', texto: 'O que NÃO acontece: seus dados não somem, não ficam escondidos e não são apagados. Você continua entrando no painel, consultando o histórico inteiro, filtrando, vendo relatórios e exportando tudo.' },
      { t: 'atencao', texto: 'Segurar dado financeiro de família como refém para forçar pagamento é o contrário do que a gente acredita — e do que a LGPD espera. Voltar a assinar destrava o lançamento na hora.' },
    ],
    veja: ['pagamento-e-cancelamento', 'exportar-e-apagar-dados'],
  },

  // ─────────────────────────────────────────────── conta e dados
  {
    slug: 'trocar-senha',
    tema: 'conta-e-dados',
    titulo: 'Trocar a senha',
    resumo: 'Mínimo de 10 caracteres, com letra e número.',
    busca: 'senha trocar alterar esqueci recuperar redefinir login entrar',
    blocos: [
      { t: 'p', texto: 'A troca é em Configurações → Conta. A senha nova precisa ter pelo menos 10 caracteres, com pelo menos uma letra e um número, e não pode ser uma daquelas óbvias demais.' },
      { t: 'p', texto: 'Esqueceu a senha? Na tela de entrada, use "Esqueci minha senha" e o link de redefinição chega no seu e-mail.' },
      { t: 'atencao', texto: 'Se a sua senha antiga é mais curta que a regra atual, ela continua funcionando no login. A exigência só vale para senha nova.' },
    ],
    veja: ['exportar-e-apagar-dados'],
  },
  {
    slug: 'exportar-e-apagar-dados',
    tema: 'conta-e-dados',
    titulo: 'Exportar ou apagar seus dados',
    resumo: 'Levar tudo embora e apagar a conta são direitos seus, e cabem em dois cliques.',
    busca: 'lgpd exportar baixar dados apagar conta excluir privacidade direitos',
    blocos: [
      { t: 'p', texto: 'Em Configurações você pode baixar um arquivo com TODOS os dados da sua família — lançamentos, categorias, mensagens e configurações — a qualquer momento, mesmo com a assinatura inativa.' },
      { t: 'p', texto: 'Também dá para pedir a exclusão da conta. O pedido congela a família e a exclusão é executada em seguida, com registro de que aconteceu (sem guardar nenhum dado pessoal dentro desse registro).' },
      { t: 'atencao', texto: 'Apagar é definitivo. Exporte antes se quiser guardar o histórico.' },
      { t: 'p', texto: 'Detalhe do tratamento de dados, com base legal e prazos de retenção, está na Política de Privacidade.' },
    ],
    veja: ['o-que-acontece-se-nao-pagar', 'quem-enxerga-o-que'],
  },
  {
    slug: 'quem-enxerga-o-que',
    tema: 'conta-e-dados',
    titulo: 'Quem enxerga os seus lançamentos',
    resumo: 'Só a sua família. Cada família é um compartimento fechado.',
    busca: 'privacidade seguranca isolamento familia outra pessoa ve acesso suporte',
    blocos: [
      { t: 'p', texto: 'Os dados de uma família não são acessíveis a nenhuma outra. Isso não é uma configuração que alguém pode esquecer de ligar: toda consulta ao banco de dados carrega a identificação da família, e uma consulta sem ela simplesmente não existe no sistema.' },
      { t: 'p', texto: 'Dentro da sua família, quem participa do grupo do WhatsApp vê o que é enviado no grupo, e quem tem login no painel vê o painel inteiro.' },
      { t: 'sub', texto: 'E o suporte?' },
      { t: 'p', texto: 'O atendimento enxerga o chamado que você abriu, com o que você escreveu e anexou nele. Ações do atendimento ficam registradas com quem fez, quando e por quê.' },
    ],
    veja: ['exportar-e-apagar-dados'],
  },

  // ─────────────────────────────────────────────── problemas
  {
    slug: 'whatsapp-desconectou',
    tema: 'problemas',
    titulo: 'O WhatsApp desconectou',
    resumo: 'Reconectar é o mesmo caminho da primeira vez.',
    busca: 'desconectou caiu parou nao envia conexao reconectar aparelho',
    blocos: [
      { t: 'p', texto: 'Trocar de celular, reinstalar o WhatsApp ou remover o aparelho na lista de conectados derruba a conexão. Em Configurações → WhatsApp, o estado aparece na hora e o botão de conectar volta.' },
      { t: 'atencao', texto: 'Se a reconexão com o MESMO número falhar dizendo que não foi possível conectar ao dispositivo, abra WhatsApp → Aparelhos conectados no celular e remova o aparelho antigo da lista. Isso resolve na hora.' },
      { t: 'p', texto: 'Nada é perdido enquanto o canal está fora do ar: os lançamentos anteriores continuam no painel, e o painel continua funcionando normalmente.' },
    ],
    veja: ['conectar-whatsapp', 'lancamento-nao-apareceu'],
  },
  {
    slug: 'lancamento-nao-apareceu',
    tema: 'problemas',
    titulo: 'Mandei a mensagem e não apareceu nada',
    resumo: 'Quase sempre é a mensagem sem o verbo no começo, ou a assinatura inativa.',
    busca: 'nao apareceu sumiu nao registrou nao respondeu silencio mensagem ignorada',
    blocos: [
      { t: 'p', texto: 'Confira nesta ordem:' },
      { t: 'passos', itens: [
        'A mensagem começa dizendo se gastou ou recebeu? "mercado 84,90" costuma não virar lançamento.',
        'A conexão do WhatsApp está ativa em Configurações → WhatsApp?',
        'A assinatura está ativa? Com ela inativa, lançar fica bloqueado (o histórico continua visível).',
        'A mensagem foi mandada na conversa certa — a sua própria, ou o grupo que criamos?',
      ] },
      { t: 'p', texto: 'Em Configurações → WhatsApp existe o registro das mensagens recebidas. Se a sua mensagem aparece lá mas não virou lançamento, o texto foi lido e não foi entendido como gasto — reescreva começando pelo verbo.' },
      { t: 'p', texto: 'Se nada disso resolver, abra um chamado em Suporte. A gente responde por lá mesmo.' },
    ],
    veja: ['como-lancar-texto', 'o-que-acontece-se-nao-pagar', 'whatsapp-desconectou'],
  },
  {
    slug: 'valor-errado-no-audio',
    tema: 'problemas',
    titulo: 'O valor do áudio saiu errado',
    resumo: 'Apague e mande de novo, dizendo o valor de uma vez só.',
    busca: 'audio valor errado centavos transcricao entendeu errado',
    blocos: [
      { t: 'p', texto: 'Valores com centavos são o caso mais frequente. Falar "quatro e cinquenta" com pausa pode ser transcrito como dois números; falar "quatro reais e cinquenta centavos", de uma vez, é mais seguro.' },
      { t: 'p', texto: 'Para corrigir: mande "apagar ultimo" e lance de novo.' },
      { t: 'p', texto: 'Barulho de fundo, áudio muito curto e falar longe do microfone também atrapalham. Sempre confira a confirmação que chega — ela mostra o valor exato que foi registrado.' },
    ],
    veja: ['lancar-por-audio', 'corrigir-lancamento'],
  },
  {
    slug: 'numero-sem-o-9',
    tema: 'problemas',
    titulo: 'O gasto de alguém está sem dono',
    resumo: 'Quase sempre é o telefone cadastrado sem o 9.',
    busca: 'telefone numero nove ddd errado sem dono pessoa nao identificada',
    blocos: [
      { t: 'p', texto: 'O telefone é o que identifica quem lançou. Se estiver cadastrado sem o 9 — ou com DDD errado —, o WhatsApp entende como outro número e o lançamento fica sem pessoa associada.' },
      { t: 'p', texto: 'O formato correto tem 11 dígitos: DDD + 9 + oito dígitos. Corrija em Configurações → WhatsApp, na lista de participantes.' },
      { t: 'p', texto: 'Os lançamentos que já entraram sem dono podem ser atribuídos na edição, em Lançamentos.' },
    ],
    veja: ['quem-pode-lancar', 'corrigir-lancamento'],
  },
  {
    slug: 'ainda-preciso-de-ajuda',
    tema: 'problemas',
    titulo: 'Não achei a resposta aqui',
    resumo: 'Abra um chamado pelo painel. A resposta chega no mesmo lugar.',
    busca: 'suporte chamado contato falar com alguem atendimento ajuda humana',
    blocos: [
      { t: 'p', texto: 'Entre no painel e vá em Suporte → Abrir chamado. Conte o que aconteceu, e anexe um print se ajudar a explicar.' },
      { t: 'p', texto: 'A resposta aparece no próprio chamado, e a lista de Suporte marca quando há algo novo para você ler. Você não precisa ficar checando e-mail.' },
      { t: 'p', texto: 'Ao descrever, ajuda muito dizer: o que você mandou (a frase exata), o que esperava que acontecesse, e o que aconteceu.' },
    ],
    veja: ['lancamento-nao-apareceu'],
  },
];

/** Artigo pelo endereço. `null` quando o slug não existe. */
export function artigoPorSlug(slug) {
  return ARTIGOS.find((a) => a.slug === slug) || null;
}

/** Os artigos de um tema, na ordem em que foram escritos. */
export function artigosDoTema(temaId) {
  return ARTIGOS.filter((a) => a.tema === temaId);
}

/** Tira acento e caixa: "Importação" e "importacao" precisam casar. */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Busca por texto livre.
 *
 * Varre título, resumo, palavras-chave e o CORPO do artigo — quem procura
 * "nove" está procurando o parágrafo sobre o telefone, e esse parágrafo não
 * tem "nove" no título. Todos os termos precisam aparecer (E, não OU): com OU,
 * duas palavras devolvem mais resultados que uma, que é o contrário do que
 * quem digita mais espera.
 */
export function buscarArtigos(termo) {
  const limpo = normalizar(termo).trim();
  if (limpo.length < 2) return [];

  const partes = limpo.split(/\s+/);

  return ARTIGOS.filter((artigo) => {
    const alvo = normalizar([
      artigo.titulo,
      artigo.resumo,
      artigo.busca,
      ...artigo.blocos.map((b) => [
        b.texto,
        ...(b.itens || []),
        ...(b.linhas || []).flat(),
      ].filter(Boolean).join(' ')),
    ].join(' '));

    return partes.every((parte) => alvo.includes(parte));
  });
}
