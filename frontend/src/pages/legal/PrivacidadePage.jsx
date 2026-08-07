import LegalLayout, { Secao, CONTATO_ENCARREGADO } from './LegalLayout';

/**
 * Política de privacidade — LGPD (Lei 13.709/2018).
 *
 * Escrita em português direto, não em juridiquês. Uma política que o cliente
 * não entende não informa nada, e "informação clara e adequada" é exigência do
 * art. 9º, não gentileza.
 */
export default function PrivacidadePage() {
  return (
    <LegalLayout
      titulo="Política de Privacidade"
      resumo="Resumo honesto: guardamos os lançamentos financeiros que você registra, o nome e o telefone de quem participa da sua família e as mensagens enviadas ao nosso número de WhatsApp. Não vendemos nada disso, não usamos para anúncio e você pode exportar ou apagar tudo quando quiser."
    >
      <Secao titulo="1. Quem é o controlador dos dados">
        <p>
          LION TECH SOLUÇÕES EM TI LTDA, CNPJ 44.124.574/0001-47, com sede em
          Mineiros-GO, é a controladora dos dados tratados no RevelaCash.
          Contato do encarregado (DPO): <strong>{CONTATO_ENCARREGADO}</strong>.
        </p>
      </Secao>

      <Secao titulo="2. Quais dados coletamos">
        <p><strong>Dados de conta:</strong> nome, e-mail e senha (a senha fica no Firebase Authentication, criptografada; nós não temos acesso a ela).</p>
        <p><strong>Dados da família:</strong> nome dos membros, telefone de WhatsApp e o papel de cada um (dono, membro ou leitor).</p>
        <p><strong>Dados financeiros:</strong> os lançamentos que você registra — descrição, valor, data, categoria, forma de pagamento e quem pagou.</p>
        <p><strong>Mensagens do WhatsApp:</strong> o texto das mensagens enviadas ao grupo ou número integrado, guardado para você conferir o que virou lançamento e o que não virou.</p>
        <p><strong>Dados de cobrança:</strong> o e-mail usado no pagamento e o identificador da assinatura no Mercado Pago. <strong>Não recebemos nem guardamos número de cartão</strong> — isso fica inteiramente com o Mercado Pago.</p>
      </Secao>

      <Secao titulo="3. Para que usamos">
        <p>Só para operar o serviço: registrar e mostrar seus lançamentos, identificar quem enviou cada mensagem, gerar relatórios, cobrar a mensalidade e dar suporte quando você pedir.</p>
        <p>Não usamos seus dados financeiros para publicidade, não vendemos, não cedemos e não treinamos modelo de IA com o seu histórico.</p>
      </Secao>

      <Secao titulo="4. Base legal">
        <p>Execução do contrato (art. 7º, V) para tudo que faz o serviço funcionar; cumprimento de obrigação legal (art. 7º, II) para os registros fiscais e contábeis da cobrança; e legítimo interesse (art. 7º, IX) para segurança, prevenção a fraude e registros de acesso.</p>
      </Secao>

      <Secao titulo="5. Com quem compartilhamos">
        <p><strong>Google Cloud / Firebase</strong> — hospedagem do sistema e do banco de dados.</p>
        <p><strong>Vercel</strong> — hospedagem da interface web.</p>
        <p><strong>Mercado Pago</strong> — processamento dos pagamentos.</p>
        <p><strong>Google (Gemini)</strong> — interpretação do texto das mensagens quando as regras automáticas não dão conta. Vai o texto da mensagem, sem o seu nome, e-mail ou histórico.</p>
        <p><strong>Meta (WhatsApp)</strong> — transporte das mensagens, conforme a política do próprio WhatsApp.</p>
        <p>Fora isso, ninguém. Só entregamos dados a autoridade pública mediante ordem judicial ou requisição legal válida.</p>
      </Secao>

      <Secao titulo="6. Onde ficam e por quanto tempo">
        <p>Os dados ficam em servidores do Google Cloud na região de São Paulo (southamerica-east1), no Brasil.</p>
        <p>Guardamos enquanto sua conta existir. Se você pedir a exclusão, a conta é congelada na hora e os dados são apagados definitivamente <strong>7 dias depois</strong> — prazo que existe para você poder desistir e para dar tempo de exportar o histórico. Registros de cobrança podem ser mantidos pelo prazo exigido pela legislação fiscal, sem os seus lançamentos.</p>
      </Secao>

      <Secao titulo="7. Seus direitos">
        <p>Você pode, a qualquer momento e sem custo:</p>
        <p>· <strong>Confirmar e acessar</strong> os dados — tudo aparece no painel;</p>
        <p>· <strong>Corrigir</strong> dados incompletos ou errados — direto na tela de lançamentos e de configurações;</p>
        <p>· <strong>Exportar</strong> tudo em arquivo JSON, em Configurações → Meus dados (portabilidade);</p>
        <p>· <strong>Excluir</strong> a conta e todos os dados, em Configurações → Meus dados;</p>
        <p>· <strong>Revogar o consentimento</strong> e saber com quem compartilhamos, escrevendo para {CONTATO_ENCARREGADO}.</p>
        <p>Respondemos em até 15 dias.</p>
      </Secao>

      <Secao titulo="8. Segurança">
        <p>Tráfego criptografado (HTTPS), autenticação pelo Firebase, isolamento entre famílias verificado por testes automatizados, e acesso administrativo restrito a contas específicas com e-mail verificado.</p>
        <p>Nenhum sistema é infalível. Se acontecer um incidente com risco relevante aos seus dados, avisamos você e a ANPD, como manda o art. 48.</p>
      </Secao>

      <Secao titulo="9. Menores de idade">
        <p>O serviço é para maiores de 18 anos. Dados de crianças e adolescentes só aparecem aqui se um responsável os registrar em um lançamento, e nesse caso são de responsabilidade dele.</p>
      </Secao>

      <Secao titulo="10. Mudanças nesta política">
        <p>Se algo mudar de forma relevante, avisamos por e-mail e dentro do sistema antes de valer. A data de atualização no topo desta página sempre indica a versão vigente.</p>
      </Secao>
    </LegalLayout>
  );
}
