import LegalLayout, { Secao, CONTATO_ENCARREGADO } from './LegalLayout';

/**
 * Termos de uso. O ponto sensível aqui é o art. 49 do CDC (arrependimento em
 * 7 dias na contratação a distância) e a regra de que o cancelamento não pode
 * ser mais difícil que a contratação — por isso o cancelamento é um botão na
 * própria tela de assinatura, não um e-mail para o suporte.
 */
export default function TermosPage() {
  return (
    <LegalLayout
      titulo="Termos de Uso"
      resumo="Resumo honesto: R$ 24,90 por mês, por família, com 14 dias de teste grátis antes de qualquer cobrança. Cancele por um botão no painel, sem ligar para ninguém. Se parar de pagar, você perde o direito de lançar, mas continua enxergando e exportando todo o seu histórico."
    >
      <Secao titulo="1. Quem presta o serviço">
        <p>
          O Financeiro Familiar é operado por LION TECH SOLUÇÕES EM TI LTDA,
          CNPJ 44.124.574/0001-47, Mineiros-GO. Contato: {CONTATO_ENCARREGADO} ou
          WhatsApp (64) 9 9955-5364.
        </p>
      </Secao>

      <Secao titulo="2. O que o serviço faz">
        <p>Registra e organiza os gastos e receitas de uma família, com lançamento pelo painel web ou por mensagem de WhatsApp, relatórios e gráficos.</p>
        <p><strong>O que ele não é:</strong> não é banco, não movimenta dinheiro, não dá consultoria financeira, contábil ou de investimento, e não substitui o seu contador. As decisões sobre o seu dinheiro são suas.</p>
      </Secao>

      <Secao titulo="3. Conta e responsabilidade">
        <p>Você é responsável por manter a senha em segredo e pelo que for feito na sua conta. A pessoa que cria a família é a <strong>dona</strong> dela: convida membros, define papéis e responde pela assinatura.</p>
        <p>Ao adicionar o telefone de outra pessoa como membro, você declara ter autorização dela para isso.</p>
      </Secao>

      <Secao titulo="4. Teste grátis, preço e cobrança">
        <p>Toda família começa com <strong>14 dias de teste grátis</strong>, sem cartão e sem cobrança.</p>
        <p>Depois disso, o plano custa <strong>R$ 24,90 por mês, por família</strong> — não por pessoa. A cobrança é mensal e recorrente, processada pelo Mercado Pago no meio de pagamento que você escolher lá.</p>
        <p>Mudança de preço só vale para ciclos futuros e é avisada com pelo menos 30 dias de antecedência. Quem já é assinante mantém o preço contratado até a data informada no aviso.</p>
      </Secao>

      <Secao titulo="5. Cancelamento e arrependimento">
        <p>Você cancela quando quiser, sozinho, pelo botão em Assinatura → Cancelar. Não é preciso ligar, mandar e-mail nem justificar.</p>
        <p>Ao cancelar, a cobrança para imediatamente e o acesso continua até o fim do período já pago. Não há multa nem fidelidade.</p>
        <p><strong>Arrependimento (art. 49 do CDC):</strong> se você cancelar em até 7 dias corridos da primeira cobrança, devolvemos o valor integral.</p>
      </Secao>

      <Secao titulo="6. O que acontece se a assinatura vencer">
        <p>Se o pagamento falhar, você tem <strong>5 dias de tolerância</strong> com acesso normal enquanto tentamos cobrar de novo.</p>
        <p>Passado esse prazo, novos lançamentos ficam bloqueados. <strong>Seus dados não são apagados</strong>: você continua consultando o histórico, os relatórios e pode exportar tudo em JSON a qualquer momento. Basta regularizar para voltar a lançar.</p>
      </Secao>

      <Secao titulo="7. Uso do WhatsApp">
        <p>A integração depende do WhatsApp, que é serviço de terceiro (Meta). Instabilidade, mudança de regra ou bloqueio de número por parte da Meta pode interromper o recebimento de mensagens — nesses casos o painel web continua funcionando normalmente e você lança por lá.</p>
        <p>É proibido usar o serviço para spam, para automação em massa ou para qualquer finalidade que viole os termos do próprio WhatsApp.</p>
      </Secao>

      <Secao titulo="8. Interpretação automática das mensagens">
        <p>Mensagens em linguagem natural são interpretadas por regras e, quando elas não bastam, por inteligência artificial. A interpretação pode errar: valor, categoria ou pessoa podem sair trocados.</p>
        <p>Confira os lançamentos. Toda transação criada por mensagem pode ser editada ou apagada no painel, e o texto original fica registrado na tela de WhatsApp para conferência.</p>
      </Secao>

      <Secao titulo="9. Disponibilidade">
        <p>Trabalhamos para manter o serviço no ar, mas não prometemos disponibilidade ininterrupta. Pode haver parada para manutenção ou por falha de fornecedores de infraestrutura.</p>
        <p>Fazemos backups regulares. Ainda assim, exportar seus dados de tempos em tempos é uma boa ideia — o botão está em Configurações.</p>
      </Secao>

      <Secao titulo="10. Limite de responsabilidade">
        <p>Nossa responsabilidade se limita ao valor pago nos últimos 12 meses. Não respondemos por decisões financeiras tomadas com base nos relatórios, nem por indisponibilidade de serviços de terceiros (WhatsApp, Mercado Pago, Google Cloud).</p>
        <p>Nada aqui afasta os direitos do consumidor previstos no CDC.</p>
      </Secao>

      <Secao titulo="11. Encerramento pela nossa parte">
        <p>Podemos suspender ou encerrar uma conta que use o serviço para fraude, atividade ilegal ou que tente burlar a cobrança e o isolamento entre famílias. Nesse caso avisamos por e-mail e damos 30 dias para exportar os dados, salvo quando a lei exigir ação imediata.</p>
      </Secao>

      <Secao titulo="12. Foro">
        <p>Aplica-se a lei brasileira. Fica eleito o foro da comarca de Mineiros-GO, ressalvado o direito do consumidor de ajuizar ação no foro do seu domicílio.</p>
      </Secao>
    </LegalLayout>
  );
}
