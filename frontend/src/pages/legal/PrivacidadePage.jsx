import LegalLayout, { Secao, Item, Atencao, Tabela, CONTATO_ENCARREGADO } from './LegalLayout';

/**
 * Política de Privacidade — versão 2.0.
 *
 * O que a versão 1 não dizia e agora diz, por ordem de risco:
 *
 *   1. TRANSFERÊNCIA INTERNACIONAL. O texto anterior afirmava que "os dados
 *      ficam em São Paulo" e listava o Gemini como parceiro — as duas coisas
 *      ao mesmo tempo. O banco fica mesmo no Brasil, mas o texto da mensagem
 *      enviado à IA e o processamento de pagamento saem do país. Omitir isso é
 *      exatamente o que o art. 33 da LGPD cobra.
 *   2. BASE LEGAL POR FINALIDADE. Citar três artigos em um parágrafo não
 *      cumpre o art. 9º, que exige informação clara sobre a finalidade
 *      específica. Virou tabela.
 *   3. RETENÇÃO POR TIPO DE DADO. "Enquanto a conta existir" não responde o
 *      que acontece com log de acesso, registro fiscal e backup.
 *   4. DECISÃO AUTOMATIZADA (art. 20). A categorização por IA é decisão
 *      automatizada, e o direito à revisão precisa estar escrito.
 *   5. COOKIES E ARMAZENAMENTO LOCAL. Não havia uma palavra sobre isso.
 */
export default function PrivacidadePage() {
  return (
    <LegalLayout
      tipo="privacidade"
      titulo="Política de Privacidade"
      resumo="Guardamos os lançamentos que você registra, o nome e o telefone de quem participa da sua família e as mensagens enviadas ao nosso número de WhatsApp. Não vendemos nada disso, não usamos para anúncio e não treinamos inteligência artificial com o seu histórico. Você pode exportar ou apagar tudo quando quiser, direto no painel."
    >
      <Secao numero="1" titulo="Controlador e encarregado">
        <Item numero="1.1">
          <strong>Controlador:</strong> LION TECH SOLUÇÕES EM TI LTDA, CNPJ 44.124.574/0001-47,
          com sede em Mineiros — GO, Brasil.
        </Item>
        <Item numero="1.2">
          <strong>Encarregado pelo tratamento de dados (DPO), art. 41 da LGPD:</strong> Kirk
          Douglas — {CONTATO_ENCARREGADO}. É o canal para exercer direitos, tirar dúvidas sobre
          esta política e receber comunicações da ANPD.
        </Item>
        <Item numero="1.3">
          Esta política se aplica ao RevelaCash (revelacash.com.br) e aos canais de mensagem
          integrados a ele.
        </Item>
      </Secao>

      <Secao numero="2" titulo="Quais dados tratamos">
        <Item numero="2.1"><strong>Dados de cadastro:</strong> nome, e-mail e telefone.</Item>
        <Item numero="2.2">
          <strong>Credencial de acesso:</strong> a senha é armazenada e verificada pelo Firebase
          Authentication (Google), em formato criptografado irreversível.
          <strong> Não temos acesso à sua senha</strong> e não conseguimos recuperá-la — apenas
          disparar uma redefinição.
        </Item>
        <Item numero="2.3">
          <strong>Dados da Família:</strong> nome dos membros, telefone de WhatsApp e o papel de
          cada um (dono, membro ou leitor).
        </Item>
        <Item numero="2.4">
          <strong>Dados financeiros:</strong> os lançamentos que você registra — descrição, valor,
          data, categoria, subcategoria, forma de pagamento, quem pagou e observações. Incluem-se
          aqui os dados extraídos de extrato bancário que você optar por importar.
        </Item>
        <Item numero="2.5">
          <strong>Mensagens:</strong> o texto das mensagens enviadas ao número ou grupo integrado,
          guardado para você conferir o que virou lançamento e o que não virou. Áudios e imagens
          enviados são transcritos ou interpretados e <strong>não são armazenados por nós após o
          processamento</strong>.
        </Item>
        <Item numero="2.6">
          <strong>Dados de suporte:</strong> o conteúdo dos chamados que você abre e os arquivos
          que anexa a eles.
        </Item>
        <Item numero="2.7">
          <strong>Dados de cobrança:</strong> o e-mail usado no pagamento e o identificador da
          assinatura no Mercado Pago.
          <strong> Não recebemos, não vemos e não armazenamos número de cartão</strong> — isso
          fica inteiramente com o Mercado Pago.
        </Item>
        <Item numero="2.8">
          <strong>Dados técnicos:</strong> registros de acesso (data, hora, endereço IP e
          identificador da requisição), conforme exige o art. 15 do Marco Civil da Internet, e
          dados de diagnóstico de erro.
        </Item>
        <Atencao>
          Não solicitamos e não queremos <strong>dados pessoais sensíveis</strong> (art. 5º, II da
          LGPD) — saúde, biometria, origem racial, convicção religiosa, opinião política. Evite
          escrevê-los na descrição de lançamentos ou em chamados.
        </Atencao>
      </Secao>

      <Secao numero="3" titulo="Para que usamos e com que base legal">
        <Item numero="3.1">
          Cada finalidade tem uma base legal própria, conforme o art. 7º da LGPD:
        </Item>
        <Tabela
          colunas={['Finalidade', 'Dados usados', 'Base legal']}
          linhas={[
            ['Criar e manter a conta, registrar e exibir lançamentos, gerar relatórios',
              'Cadastro, Família, financeiros',
              'Execução de contrato (art. 7º, V)'],
            ['Interpretar mensagens de WhatsApp e atribuir o lançamento a quem enviou',
              'Mensagens, telefone',
              'Execução de contrato (art. 7º, V)'],
            ['Cobrar a mensalidade e controlar a assinatura',
              'Cadastro, cobrança',
              'Execução de contrato (art. 7º, V)'],
            ['Emitir e guardar registros fiscais e contábeis da cobrança',
              'Cobrança',
              'Obrigação legal (art. 7º, II)'],
            ['Guardar registros de acesso',
              'Técnicos',
              'Obrigação legal (art. 7º, II) — Marco Civil, art. 15'],
            ['Segurança, prevenção a fraude, abuso e uso indevido',
              'Técnicos, cadastro',
              'Legítimo interesse (art. 7º, IX)'],
            ['Atender chamados de suporte',
              'Suporte, cadastro',
              'Execução de contrato (art. 7º, V)'],
            ['Avisar sobre mudanças no serviço, no preço ou nesta política',
              'Cadastro',
              'Execução de contrato (art. 7º, V)'],
          ]}
        />
        <Item numero="3.2">
          <strong>O que NÃO fazemos:</strong> não usamos seus dados financeiros para publicidade,
          não vendemos, não cedemos para fins comerciais, não fazemos perfilamento para terceiros
          e <strong>não treinamos modelos de inteligência artificial com o seu histórico</strong>.
        </Item>
        <Item numero="3.3">
          Comunicação de marketing, se houver, depende de consentimento separado (art. 7º, I) e
          pode ser revogada a qualquer momento, sem afetar o funcionamento do Serviço.
        </Item>
      </Secao>

      <Secao numero="4" titulo="Decisões automatizadas e inteligência artificial">
        <Item numero="4.1">
          Quando você lança por mensagem, o sistema tenta identificar automaticamente o tipo
          (gasto ou recebimento), o valor, a categoria e a subcategoria. Isso é feito primeiro por
          regras determinísticas e, quando elas não bastam, por modelo de linguagem de terceiro.
        </Item>
        <Item numero="4.2">
          O que é enviado ao provedor de IA: <strong>o texto da mensagem</strong> (ou a
          transcrição do áudio / o conteúdo da imagem) e a lista de categorias e nomes da sua
          Família, necessária para a classificação.
          <strong> Não enviamos seu nome, e-mail, telefone nem o histórico financeiro completo.</strong>
        </Item>
        <Item numero="4.3">
          Ao usar a assistente virtual, o texto da sua pergunta e os totais necessários para
          respondê-la são enviados ao provedor. As respostas se baseiam exclusivamente nos dados
          da sua própria Família.
        </Item>
        <Item numero="4.4">
          <strong>Direito à revisão (art. 20 da LGPD):</strong> você pode solicitar revisão humana
          de qualquer classificação automática e pedir informações claras sobre os critérios
          utilizados, escrevendo para {CONTATO_ENCARREGADO}. Na prática, você também pode corrigir
          diretamente: todo lançamento automático é editável no painel.
        </Item>
        <Item numero="4.5">
          Nenhuma decisão automatizada define seu acesso ao Serviço, seu preço ou qualquer
          restrição de direitos. Ela apenas organiza o lançamento.
        </Item>
      </Secao>

      <Secao numero="5" titulo="Com quem compartilhamos (operadores)">
        <Item numero="5.1">
          Contratamos fornecedores que tratam dados <strong>em nosso nome e sob nossas
          instruções</strong>, na condição de operadores (art. 5º, VII da LGPD):
        </Item>
        <Tabela
          colunas={['Fornecedor', 'Para quê', 'Onde processa']}
          linhas={[
            ['Google Cloud / Firebase', 'Hospedagem do sistema, banco de dados, autenticação e backup', 'Brasil (São Paulo)'],
            ['Vercel', 'Hospedagem da interface web', 'Estados Unidos e rede global'],
            ['Mercado Pago', 'Processamento de pagamentos e assinatura', 'Brasil'],
            ['Google (Gemini)', 'Interpretação de mensagens e assistente virtual', 'Estados Unidos'],
            ['Meta (WhatsApp)', 'Transporte das mensagens', 'Estados Unidos e rede global'],
            ['Resend', 'Envio de e-mails transacionais do suporte', 'Estados Unidos'],
          ]}
        />
        <Item numero="5.2">
          Fora desta lista, não compartilhamos com ninguém. Dados só são entregues a autoridade
          pública mediante <strong>ordem judicial ou requisição legal válida</strong>, e, quando a
          lei permitir, avisamos você.
        </Item>
        <Item numero="5.3">
          Em caso de reorganização societária, fusão ou aquisição, os dados podem ser transferidos
          à sucessora, mantidas as finalidades e as garantias desta política, com comunicação
          prévia a você.
        </Item>
      </Secao>

      <Secao numero="6" titulo="Transferência internacional de dados">
        <Item numero="6.1">
          <strong>Seu banco de dados fica no Brasil.</strong> Lançamentos, cadastro, mensagens
          registradas, anexos e backups ficam em servidores do Google Cloud na região de São Paulo
          (southamerica-east1).
        </Item>
        <Item numero="6.2">
          <strong>Há, porém, transferência internacional</strong> nas situações da cláusula 5:
          o processamento pelo provedor de IA, a hospedagem da interface, o transporte das
          mensagens pelo WhatsApp e o envio de e-mails ocorrem em infraestrutura fora do Brasil,
          principalmente nos Estados Unidos.
        </Item>
        <Item numero="6.3">
          Essas transferências se apoiam no art. 33, II e IX da LGPD: cláusulas contratuais
          padrão oferecidas pelos fornecedores e necessidade para a execução do contrato com você.
        </Item>
        <Item numero="6.4">
          Você pode solicitar informações adicionais sobre as salvaguardas adotadas escrevendo
          para {CONTATO_ENCARREGADO}.
        </Item>
      </Secao>

      <Secao numero="7" titulo="Por quanto tempo guardamos">
        <Tabela
          colunas={['Tipo de dado', 'Prazo de retenção', 'Por quê']}
          linhas={[
            ['Cadastro, Família e lançamentos', 'Enquanto a conta existir', 'Necessário para prestar o serviço'],
            ['Após pedido de exclusão', 'Apagados em 7 dias', 'Prazo para você desistir e exportar'],
            ['Mensagens registradas', 'Enquanto a conta existir', 'Conferência do que virou lançamento'],
            ['Anexos de suporte', 'Apagados junto com a Família', 'Não têm utilidade isolada'],
            ['Registros de acesso (IP, data/hora)', '6 meses', 'Marco Civil da Internet, art. 15'],
            ['Registros fiscais da cobrança', '5 anos', 'Legislação fiscal, sem os seus lançamentos'],
            ['Backups', '30 dias', 'Recuperação em caso de desastre'],
          ]}
        />
        <Item numero="7.1">
          Ao pedir exclusão, a conta é <strong>congelada imediatamente</strong> e os dados são
          apagados em definitivo <strong>7 dias depois</strong>. O prazo existe para você poder
          desistir e para dar tempo de exportar o histórico.
        </Item>
        <Item numero="7.2">
          Dados presentes em backups criados antes da exclusão desaparecem naturalmente com o
          vencimento do backup, em no máximo 30 dias, e não são restaurados para uso.
        </Item>
        <Item numero="7.3">
          Guardamos um registro da exclusão (data e identificador), sem qualquer dado pessoal
          dentro, como prova de que ela aconteceu.
        </Item>
      </Secao>

      <Secao numero="8" titulo="Seus direitos como titular">
        <Item numero="8.1">
          A LGPD (art. 18) garante a você, gratuitamente e a qualquer momento:
        </Item>
        <Item numero="(a)">
          <strong>Confirmação e acesso</strong> — tudo aparece no painel, e a exportação traz o
          conjunto completo;
        </Item>
        <Item numero="(b)">
          <strong>Correção</strong> de dados incompletos, inexatos ou desatualizados — direto nas
          telas de lançamento e de configurações;
        </Item>
        <Item numero="(c)">
          <strong>Anonimização, bloqueio ou eliminação</strong> de dados desnecessários ou
          tratados em desconformidade;
        </Item>
        <Item numero="(d)">
          <strong>Portabilidade</strong> — exportação em arquivo aberto (JSON), em
          <em> Configurações → Meus dados</em>;
        </Item>
        <Item numero="(e)">
          <strong>Eliminação</strong> dos dados tratados com consentimento;
        </Item>
        <Item numero="(f)">
          <strong>Informação sobre compartilhamento</strong> — a cláusula 5 já traz a lista, e
          você pode pedir detalhes;
        </Item>
        <Item numero="(g)">
          <strong>Informação sobre a possibilidade de não consentir</strong> e as consequências
          disso;
        </Item>
        <Item numero="(h)">
          <strong>Revogação do consentimento</strong>, quando essa for a base legal;
        </Item>
        <Item numero="(i)">
          <strong>Revisão de decisão automatizada</strong> (art. 20), conforme a cláusula 4.4;
        </Item>
        <Item numero="(j)">
          <strong>Oposição</strong> a tratamento baseado em legítimo interesse.
        </Item>
        <Item numero="8.2">
          <strong>Como exercer:</strong> a maior parte é autoatendimento no painel. Para o
          restante, escreva para {CONTATO_ENCARREGADO}.
          <strong> Respondemos em até 15 dias</strong>, podendo pedir confirmação de identidade
          antes de atender — é uma proteção sua.
        </Item>
        <Item numero="8.3">
          Você também pode peticionar diretamente à <strong>Autoridade Nacional de Proteção de
          Dados (ANPD)</strong>, em gov.br/anpd.
        </Item>
      </Secao>

      <Secao numero="9" titulo="Cookies e armazenamento local">
        <Item numero="9.1">
          <strong>Não usamos cookies de publicidade, rastreamento entre sites ou redes sociais.</strong>
        </Item>
        <Item numero="9.2">
          Usamos armazenamento local do navegador para manter você conectado (token de sessão) e
          guardar preferências de interface. São estritamente necessários ao funcionamento e não
          exigem consentimento prévio.
        </Item>
        <Item numero="9.3">
          O reCAPTCHA do Google é usado para distinguir acesso legítimo de automação abusiva, o
          que envolve cookies próprios do Google, conforme a política dele.
        </Item>
        <Item numero="9.4">
          Limpar os dados do navegador encerra a sessão e remove essas informações.
        </Item>
      </Secao>

      <Secao numero="10" titulo="Segurança">
        <Item numero="10.1">
          Adotamos medidas técnicas e administrativas compatíveis com o risco (art. 46), entre
          elas:
        </Item>
        <Item numero="(a)">tráfego sempre criptografado (HTTPS/TLS) e HSTS;</Item>
        <Item numero="(b)">
          autenticação pelo Firebase, com exigência de senha forte e verificação de e-mail;
        </Item>
        <Item numero="(c)">
          <strong>isolamento entre Famílias</strong> aplicado em toda consulta ao banco e coberto
          por testes automatizados executados a cada alteração;
        </Item>
        <Item numero="(d)">
          verificação de integridade do aplicativo (App Check), que impede chamadas à nossa API a
          partir de aplicações não autorizadas;
        </Item>
        <Item numero="(e)">
          banco de dados sem acesso direto pela internet — todo acesso passa pela nossa API
          autenticada;
        </Item>
        <Item numero="(f)">
          limites de requisição para conter abuso e negação de serviço;
        </Item>
        <Item numero="(g)">
          acesso administrativo restrito, com credenciais próprias, papéis limitados e registro de
          auditoria de cada ação sobre conta de cliente;
        </Item>
        <Item numero="(h)">backup diário criptografado, com retenção de 30 dias.</Item>
        <Item numero="10.2">
          Nenhum sistema é infalível. Havendo incidente de segurança com risco relevante aos seus
          dados, comunicamos você e a ANPD, conforme o art. 48, informando o que houve, quais
          dados foram afetados e o que fazer.
        </Item>
      </Secao>

      <Secao numero="11" titulo="Dados de outras pessoas que você cadastra">
        <Item numero="11.1">
          Ao adicionar um membro à sua Família, você fornece dados pessoais de terceiro. Nesse
          ato, <strong>você declara ter autorização dessa pessoa</strong>.
        </Item>
        <Item numero="11.2">
          Essa pessoa tem os mesmos direitos da cláusula 8 e pode exercê-los diretamente conosco,
          mesmo sem ter conta de acesso.
        </Item>
        <Item numero="11.3">
          O Titular da Família pode remover um membro a qualquer momento, o que interrompe novos
          tratamentos referentes a ele.
        </Item>
      </Secao>

      <Secao numero="12" titulo="Crianças e adolescentes">
        <Item numero="12.1">
          O Serviço é destinado a maiores de 18 anos e não é direcionado a crianças e
          adolescentes.
        </Item>
        <Item numero="12.2">
          Se um responsável registrar dados de menor em um lançamento, esses dados ficam sob a
          responsabilidade dele, no melhor interesse do menor (art. 14 da LGPD).
        </Item>
        <Item numero="12.3">
          Identificando conta criada por menor, encerramos o cadastro e eliminamos os dados.
        </Item>
      </Secao>

      <Secao numero="13" titulo="Alterações nesta política">
        <Item numero="13.1">
          Podemos atualizar esta política para refletir mudanças no Serviço, nos fornecedores ou
          na legislação.
        </Item>
        <Item numero="13.2">
          <strong>Mudanças relevantes</strong> — nova finalidade, novo fornecedor com acesso a
          dados, nova transferência internacional — são comunicadas por e-mail e dentro do
          Serviço com pelo menos 30 dias de antecedência.
        </Item>
        <Item numero="13.3">
          A versão e a data de vigência constam no cabeçalho desta página. Versões anteriores
          podem ser solicitadas ao encarregado.
        </Item>
      </Secao>

      <Secao numero="14" titulo="Contato do encarregado">
        <Item numero="14.1">
          Dúvidas, solicitações de direitos e comunicações sobre privacidade:
          <strong> {CONTATO_ENCARREGADO}</strong>.
        </Item>
        <Item numero="14.2">
          LION TECH SOLUÇÕES EM TI LTDA · CNPJ 44.124.574/0001-47 · Mineiros — GO, Brasil ·
          WhatsApp (64) 9 9955-5364.
        </Item>
      </Secao>
    </LegalLayout>
  );
}
