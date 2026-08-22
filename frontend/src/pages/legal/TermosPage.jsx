import LegalLayout, { Secao, Item, Atencao, CONTATO_ENCARREGADO } from './LegalLayout';

/**
 * Termos de Uso — versão 2.0.
 *
 * A versão 1 cobria o essencial de consumo (art. 49 do CDC, cancelamento por
 * botão) mas deixava de fora o que costuma virar discussão de verdade num
 * SaaS: propriedade do conteúdo, licença de uso, uso aceitável, suspensão,
 * responsabilidade sobre o WhatsApp de terceiro, disponibilidade sem SLA
 * prometido, e a natureza do que a IA produz.
 *
 * Dois pontos são tratados com destaque porque são os de maior exposição:
 *
 *   - Cláusula 9 (IA): a categorização automática é decisão automatizada sobre
 *     dado do titular. A LGPD (art. 20) dá direito a revisão, e o texto diz
 *     como exercê-lo — sem isso, a defesa em um questionamento seria "estava
 *     implícito".
 *   - Cláusula 6 (trial): o teste é por FAMÍLIA e por pessoa. Sem dizer, criar
 *     contas em série para nunca pagar seria comportamento tolerado pelo
 *     próprio contrato.
 */
export default function TermosPage() {
  return (
    <LegalLayout
      tipo="termos"
      titulo="Termos de Uso"
      resumo="R$ 24,90 por mês, por família, com 7 dias de teste grátis antes de qualquer cobrança. Cancele por um botão no painel, sem ligar para ninguém e sem multa. Se parar de pagar, você perde o direito de lançar, mas continua enxergando e exportando todo o seu histórico — nós não seguramos os seus dados."
    >
      <Secao numero="1" titulo="Definições">
        <Item numero="1.1">
          <strong>RevelaCash</strong> ou <strong>Serviço</strong>: a plataforma de organização
          financeira familiar acessível em revelacash.com.br e pelos canais de mensagem integrados.
        </Item>
        <Item numero="1.2">
          <strong>Nós</strong>, <strong>nosso</strong> ou <strong>Contratada</strong>: LION TECH
          SOLUÇÕES EM TI LTDA, CNPJ 44.124.574/0001-47, com sede em Mineiros-GO.
        </Item>
        <Item numero="1.3">
          <strong>Você</strong> ou <strong>Usuário</strong>: a pessoa física que cria uma conta
          ou é adicionada a uma Família.
        </Item>
        <Item numero="1.4">
          <strong>Família</strong>: o grupo de usuários que compartilham os mesmos dados
          financeiros. É a unidade de cobrança e de isolamento: dados de uma Família não são
          acessíveis a nenhuma outra.
        </Item>
        <Item numero="1.5">
          <strong>Titular</strong>: quem criou a Família. Responde pela assinatura, convida
          membros e define papéis.
        </Item>
        <Item numero="1.6">
          <strong>Conteúdo do Usuário</strong>: os lançamentos, descrições, anexos, mensagens e
          demais informações que você registra no Serviço.
        </Item>
      </Secao>

      <Secao numero="2" titulo="Aceitação e capacidade">
        <Item numero="2.1">
          Ao criar uma conta você declara ter lido e aceito estes Termos e a Política de
          Privacidade, que integra este contrato para todos os efeitos.
        </Item>
        <Item numero="2.2">
          O Serviço é destinado a <strong>maiores de 18 anos</strong>, plenamente capazes. Não
          criamos contas para menores nem direcionamos o Serviço a crianças e adolescentes.
        </Item>
        <Item numero="2.3">
          Se você aceita estes Termos em nome de uma pessoa jurídica, declara ter poderes para
          obrigá-la.
        </Item>
      </Secao>

      <Secao numero="3" titulo="O que o Serviço faz — e o que não faz">
        <Item numero="3.1">
          O RevelaCash registra e organiza gastos e receitas de uma família, com lançamento pelo
          painel web ou por mensagem de WhatsApp, além de relatórios, gráficos, orçamentos,
          contas fixas, faturas de cartão e importação de extrato bancário.
        </Item>
        <Item numero="3.2">
          <strong>O Serviço não é instituição financeira</strong> e não é autorizado nem
          fiscalizado pelo Banco Central. Não movimenta, custodia, transfere nem investe dinheiro.
        </Item>
        <Item numero="3.3">
          <strong>Não prestamos consultoria</strong> financeira, de investimentos, contábil,
          tributária ou jurídica. Relatórios, gráficos e qualquer sugestão gerada pelo Serviço são
          material informativo baseado no que você mesmo registrou.
        </Item>
        <Item numero="3.4">
          O Serviço não substitui contador, nem serve como escrituração contábil ou fiscal
          oficial.
        </Item>
        <Atencao>
          As decisões sobre o seu dinheiro são exclusivamente suas. Não respondemos por resultado
          financeiro obtido ou não obtido a partir do uso do Serviço.
        </Atencao>
      </Secao>

      <Secao numero="4" titulo="Conta, senha e responsabilidade">
        <Item numero="4.1">
          Você é responsável por manter a confidencialidade da sua senha e por toda atividade
          realizada na sua conta.
        </Item>
        <Item numero="4.2">
          Exigimos senha com no mínimo 10 caracteres, contendo letras e números. Recomendamos uma
          senha exclusiva deste Serviço.
        </Item>
        <Item numero="4.3">
          Avise imediatamente pelos canais da cláusula 17 se suspeitar de acesso não autorizado.
          Até o aviso, presumem-se legítimas as ações praticadas com as suas credenciais.
        </Item>
        <Item numero="4.4">
          <strong>Ao adicionar o telefone ou os dados de outra pessoa</strong> como membro da
          Família, você declara ter autorização dela e assume a condição de responsável por essa
          inclusão perante ela e perante a LGPD.
        </Item>
        <Item numero="4.5">
          Membros com papel de <em>leitor</em> visualizam sem lançar; <em>membro</em> lança e
          edita; o <em>Titular</em> ainda administra assinatura, membros e canal de mensagens.
        </Item>
      </Secao>

      <Secao numero="5" titulo="Propriedade do conteúdo e licença">
        <Item numero="5.1">
          <strong>O Conteúdo do Usuário é seu.</strong> Não adquirimos propriedade sobre os seus
          lançamentos, anexos ou histórico financeiro.
        </Item>
        <Item numero="5.2">
          Você nos concede licença limitada, não exclusiva e revogável para armazenar, processar,
          transmitir e exibir esse conteúdo <strong>exclusivamente para operar o Serviço para
          você</strong> — incluindo backup, geração de relatórios e o processamento descrito na
          cláusula 9.
        </Item>
        <Item numero="5.3">
          A licença termina quando você apaga o conteúdo ou encerra a conta, ressalvadas cópias em
          backup, que seguem os prazos da Política de Privacidade.
        </Item>
        <Item numero="5.4">
          <strong>Não usamos o seu conteúdo para treinar modelos de inteligência artificial</strong>,
          nem o vendemos, cedemos ou usamos para publicidade.
        </Item>
        <Item numero="5.5">
          O software, a marca RevelaCash, a interface e a documentação são nossos ou de nossos
          licenciadores. Estes Termos concedem a você um direito de uso do Serviço, não de
          propriedade sobre ele.
        </Item>
      </Secao>

      <Secao numero="6" titulo="Teste grátis, preço e cobrança">
        <Item numero="6.1">
          Toda Família começa com <strong>7 (sete) dias de teste grátis</strong>, sem exigência de
          cartão e sem cobrança.
        </Item>
        <Item numero="6.2">
          O teste é <strong>um por pessoa e um por Família</strong>. Criar contas sucessivas para
          renovar o período gratuito é uso abusivo e autoriza a suspensão prevista na cláusula 12.
        </Item>
        <Item numero="6.3">
          Encerrado o teste, o plano custa <strong>R$ 24,90 (vinte e quatro reais e noventa
          centavos) por mês, por Família</strong> — não por pessoa. A quantidade de membros não
          altera o preço.
        </Item>
        <Item numero="6.4">
          A cobrança é <strong>mensal e recorrente</strong>, processada pelo Mercado Pago no meio
          de pagamento que você cadastrar lá. Não recebemos nem armazenamos dados de cartão.
        </Item>
        <Item numero="6.5">
          A renovação é automática enquanto você não cancelar. Cada renovação inicia um novo ciclo
          de 30 dias.
        </Item>
        <Item numero="6.6">
          <strong>Mudança de preço</strong> só vale para ciclos futuros e é comunicada com pelo
          menos 30 (trinta) dias de antecedência, por e-mail e dentro do Serviço. Quem já é
          assinante mantém o preço contratado até a data informada no aviso e pode cancelar sem
          ônus antes que o novo valor passe a valer.
        </Item>
        <Item numero="6.7">
          Tributos aplicáveis, quando devidos, estão incluídos no valor anunciado.
        </Item>
      </Secao>

      <Secao numero="7" titulo="Cancelamento, arrependimento e reembolso">
        <Item numero="7.1">
          <strong>Você cancela sozinho</strong>, a qualquer momento, pelo botão em
          <em> Assinatura → Cancelar</em>. Não é preciso ligar, enviar e-mail ou justificar — o
          cancelamento não é mais difícil que a contratação, conforme o art. 49, parágrafo único,
          do CDC e o Decreto 7.962/2013.
        </Item>
        <Item numero="7.2">
          Ao cancelar, a cobrança recorrente cessa imediatamente e o acesso permanece até o fim do
          período já pago. <strong>Não há multa nem fidelidade.</strong>
        </Item>
        <Item numero="7.3">
          <strong>Direito de arrependimento (art. 49 do CDC):</strong> se você cancelar em até 7
          (sete) dias corridos contados da primeira cobrança, devolvemos o valor integral, pelo
          mesmo meio de pagamento, em até 10 dias úteis a partir do processamento pelo Mercado
          Pago.
        </Item>
        <Item numero="7.4">
          Fora da hipótese de arrependimento, não há reembolso proporcional de período já iniciado
          — mas o acesso continua até o fim dele.
        </Item>
        <Item numero="7.5">
          Falha nossa que impeça o uso do Serviço por período relevante dá direito a abatimento
          proporcional ou reembolso, conforme o art. 20 do CDC. Basta pedir pelos canais da
          cláusula 17.
        </Item>
        <Item numero="7.6">
          Contestação de cobrança (<em>chargeback</em>) aberta sem tentativa prévia de contato
          pode levar à suspensão do acesso até o esclarecimento. Fale conosco primeiro: resolvemos
          mais rápido.
        </Item>
      </Secao>

      <Secao numero="8" titulo="Inadimplência: o que acontece">
        <Item numero="8.1">
          Se um pagamento falhar, você tem <strong>5 (cinco) dias de tolerância</strong> com
          acesso normal, enquanto novas tentativas de cobrança são feitas.
        </Item>
        <Item numero="8.2">
          Passado esse prazo, ficam bloqueados apenas os <strong>novos lançamentos</strong> e os
          recursos exclusivos de assinante.
        </Item>
        <Item numero="8.3">
          <strong>Seus dados não são apagados nem ficam inacessíveis.</strong> Você continua
          consultando o histórico, vendo relatórios e exportando tudo em arquivo aberto, a
          qualquer momento, mesmo com a assinatura vencida.
        </Item>
        <Atencao>
          Não condicionamos a devolução dos seus próprios dados ao pagamento de qualquer valor.
          Regularizar a assinatura restabelece o lançamento imediatamente.
        </Atencao>
      </Secao>

      <Secao numero="9" titulo="Interpretação automática e inteligência artificial">
        <Item numero="9.1">
          Mensagens em linguagem natural são interpretadas primeiro por regras determinísticas e,
          quando elas não bastam, por modelo de inteligência artificial de terceiro, conforme a
          Política de Privacidade.
        </Item>
        <Item numero="9.2">
          <strong>A interpretação pode errar.</strong> Valor, categoria, data ou autor podem sair
          trocados. Todo lançamento criado automaticamente pode ser editado ou excluído no painel,
          e o texto original fica registrado para conferência.
        </Item>
        <Item numero="9.3">
          A assistente virtual responde com base exclusivamente nos dados da sua própria Família.
          Suas respostas são informativas e <strong>não constituem recomendação de investimento,
          crédito ou qualquer produto financeiro</strong>.
        </Item>
        <Item numero="9.4">
          <strong>Direito à revisão (art. 20 da LGPD):</strong> a categorização automática de um
          lançamento é decisão automatizada sobre dado seu. Você pode solicitar revisão humana e
          informações sobre os critérios utilizados escrevendo para {CONTATO_ENCARREGADO}.
          Respondemos em até 15 dias.
        </Item>
        <Item numero="9.5">
          Existe limite diário de uso dos recursos de IA por Família, para conter abuso e manter o
          preço. O limite é informado no painel e não afeta o lançamento por regras.
        </Item>
      </Secao>

      <Secao numero="10" titulo="Canal de WhatsApp">
        <Item numero="10.1">
          A integração depende do WhatsApp, serviço operado pela Meta. Instabilidade, mudança de
          política, limitação ou bloqueio de número por parte da Meta pode interromper o envio e o
          recebimento de mensagens.
        </Item>
        <Item numero="10.2">
          Nesses casos o painel web continua funcionando normalmente, e o lançamento pode ser
          feito por lá. <strong>Não respondemos por indisponibilidade causada por terceiros</strong>,
          mas trabalhamos para restabelecer o canal.
        </Item>
        <Item numero="10.3">
          A configuração de instância, credenciais e grupo é feita e mantida por nós. Você não
          precisa e não deve fornecer credenciais de infraestrutura a ninguém.
        </Item>
        <Item numero="10.4">
          É vedado usar o canal para disparo em massa, spam, automação comercial ou qualquer
          finalidade que viole os termos do próprio WhatsApp.
        </Item>
      </Secao>

      <Secao numero="11" titulo="Uso aceitável">
        <Item numero="11.1">Ao usar o Serviço, você concorda em NÃO:</Item>
        <Item numero="(a)">
          tentar acessar dados de outra Família, contornar o isolamento entre contas ou explorar
          falha de segurança;
        </Item>
        <Item numero="(b)">
          fazer engenharia reversa, copiar, revender, sublicenciar ou oferecer o Serviço a
          terceiros como se fosse seu;
        </Item>
        <Item numero="(c)">
          usar robôs, raspagem ou automação não autorizada contra a interface ou a API;
        </Item>
        <Item numero="(d)">
          sobrecarregar deliberadamente a infraestrutura, inclusive por volume anormal de
          requisições ou de chamadas de IA;
        </Item>
        <Item numero="(e)">
          registrar conteúdo ilícito, ofensivo, ou dado pessoal de terceiro sem autorização;
        </Item>
        <Item numero="(f)">
          usar o Serviço para lavagem de dinheiro, fraude, ou qualquer atividade ilegal;
        </Item>
        <Item numero="(g)">
          burlar cobrança, inclusive pela criação sucessiva de contas para renovar o teste
          gratuito.
        </Item>
        <Item numero="11.2">
          <strong>Pesquisa de segurança é bem-vinda.</strong> Se você encontrar uma vulnerabilidade,
          comunique-a para {CONTATO_ENCARREGADO} antes de divulgar. Não tomamos medida contra quem
          reporta de boa-fé, sem acessar dado de terceiro e sem degradar o serviço.
        </Item>
      </Secao>

      <Secao numero="12" titulo="Suspensão e encerramento pela nossa parte">
        <Item numero="12.1">
          Podemos suspender ou encerrar uma conta que viole a cláusula 11, que seja usada para
          fraude ou atividade ilegal, ou por determinação legal.
        </Item>
        <Item numero="12.2">
          Salvo quando a lei ou o risco iminente exigir ação imediata, <strong>avisamos antes</strong>,
          indicamos o motivo e damos oportunidade de correção.
        </Item>
        <Item numero="12.3">
          Havendo encerramento, concedemos <strong>30 (trinta) dias</strong> para exportação
          integral dos dados, salvo impedimento legal.
        </Item>
        <Item numero="12.4">
          Se decidirmos descontinuar o Serviço por inteiro, avisamos com pelo menos 60 (sessenta)
          dias de antecedência, mantemos a exportação disponível durante todo o período e
          reembolsamos proporcionalmente o período pago e não usufruído.
        </Item>
      </Secao>

      <Secao numero="13" titulo="Disponibilidade, suporte e backup">
        <Item numero="13.1">
          Trabalhamos para manter o Serviço disponível de forma contínua, mas
          <strong> não contratamos nível de serviço (SLA) garantido</strong> neste plano. Pode
          haver parada programada para manutenção ou interrupção por falha de fornecedores de
          infraestrutura.
        </Item>
        <Item numero="13.2">
          Manutenção programada com impacto previsto é comunicada com antecedência razoável dentro
          do Serviço.
        </Item>
        <Item numero="13.3">
          O suporte é prestado pelos canais da cláusula 17 e pela área de Suporte dentro do
          painel, em dias úteis. Buscamos responder em até 2 dias úteis.
        </Item>
        <Item numero="13.4">
          Realizamos <strong>backup automático diário</strong> da base de dados, retido por 30
          dias. Ainda assim, recomendamos exportar seus dados periodicamente — a função está em
          <em> Configurações → Meus dados</em>.
        </Item>
      </Secao>

      <Secao numero="14" titulo="Garantias e limitação de responsabilidade">
        <Item numero="14.1">
          O Serviço é fornecido no estado em que se encontra, com as funcionalidades descritas
          nesta data. Não garantimos que atenderá a finalidade específica não anunciada, nem que
          funcionará livre de erros.
        </Item>
        <Item numero="14.2">
          <strong>Nossa responsabilidade total</strong>, por qualquer causa relacionada ao Serviço,
          fica limitada ao valor efetivamente pago por você nos 12 (doze) meses anteriores ao fato
          gerador.
        </Item>
        <Item numero="14.3">
          Não respondemos por lucros cessantes, perda de oportunidade, dano indireto, nem por
          decisão financeira tomada com base em relatórios ou respostas geradas pelo Serviço.
        </Item>
        <Item numero="14.4">
          Não respondemos por indisponibilidade ou falha atribuível a terceiros essenciais
          (Meta/WhatsApp, Mercado Pago, Google Cloud, Vercel), nem por caso fortuito ou força
          maior, incluindo falha de energia, de telecomunicações e ataques cibernéticos de
          terceiros.
        </Item>
        <Atencao>
          Nenhuma cláusula destes Termos afasta ou reduz direitos que o Código de Defesa do
          Consumidor assegura a você. Havendo conflito, prevalece o CDC.
        </Atencao>
      </Secao>

      <Secao numero="15" titulo="Proteção de dados">
        <Item numero="15.1">
          O tratamento de dados pessoais é regido pela nossa Política de Privacidade, disponível
          em revelacash.com.br/privacidade, que integra este contrato.
        </Item>
        <Item numero="15.2">
          Em relação aos dados de outros membros que você cadastra, você atua como responsável
          pela licitude da inclusão, nos termos da cláusula 4.4.
        </Item>
        <Item numero="15.3">
          Incidentes de segurança com risco relevante são comunicados a você e à ANPD, conforme o
          art. 48 da LGPD.
        </Item>
      </Secao>

      <Secao numero="16" titulo="Alterações destes Termos">
        <Item numero="16.1">
          Podemos alterar estes Termos para refletir mudanças no Serviço ou na legislação.
        </Item>
        <Item numero="16.2">
          <strong>Alterações relevantes</strong> — preço, forma de cobrança, direitos e deveres
          das partes — são comunicadas com pelo menos 30 (trinta) dias de antecedência, por e-mail
          e dentro do Serviço.
        </Item>
        <Item numero="16.3">
          Se você não concordar, pode cancelar sem ônus antes da entrada em vigor. Continuar
          usando o Serviço após a vigência significa aceitação.
        </Item>
        <Item numero="16.4">
          A versão e a data de vigência constam no cabeçalho desta página. Versões anteriores
          podem ser solicitadas pelos canais da cláusula 17.
        </Item>
      </Secao>

      <Secao numero="17" titulo="Contato e atendimento">
        <Item numero="17.1">
          <strong>Suporte e dúvidas:</strong> área de Suporte no painel, ou WhatsApp
          (64) 9 9955-5364.
        </Item>
        <Item numero="17.2">
          <strong>Assuntos contratuais e de privacidade:</strong> {CONTATO_ENCARREGADO}.
        </Item>
        <Item numero="17.3">
          <strong>Endereço:</strong> LION TECH SOLUÇÕES EM TI LTDA, CNPJ 44.124.574/0001-47,
          Mineiros — GO, Brasil.
        </Item>
        <Item numero="17.4">
          Você também pode recorrer aos órgãos de defesa do consumidor, inclusive pela plataforma
          consumidor.gov.br.
        </Item>
      </Secao>

      <Secao numero="18" titulo="Disposições finais">
        <Item numero="18.1">
          <strong>Independência das cláusulas:</strong> se alguma disposição for considerada
          inválida, as demais continuam em pleno vigor.
        </Item>
        <Item numero="18.2">
          <strong>Tolerância:</strong> deixar de exigir o cumprimento de uma cláusula não implica
          renúncia a ela.
        </Item>
        <Item numero="18.3">
          <strong>Cessão:</strong> você não pode ceder este contrato sem nosso consentimento.
          Podemos cedê-lo em caso de reorganização societária, fusão ou aquisição, mantidas as
          condições contratadas e comunicando você com antecedência.
        </Item>
        <Item numero="18.4">
          <strong>Integralidade:</strong> estes Termos e a Política de Privacidade constituem o
          acordo integral entre as partes quanto ao Serviço.
        </Item>
        <Item numero="18.5">
          <strong>Lei e foro:</strong> aplica-se a lei brasileira. Fica eleito o foro da comarca
          de Mineiros-GO, <strong>ressalvado o direito do consumidor de ajuizar ação no foro do
          seu próprio domicílio</strong>, conforme o art. 101, I, do CDC.
        </Item>
      </Secao>
    </LegalLayout>
  );
}
