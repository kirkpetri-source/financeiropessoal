#!/usr/bin/env node
/**
 * Testa o aviso de cadastro novo no WhatsApp do operador.
 *
 *   node tools/testar-notificacao-cadastro.js            # simula, não envia
 *   node tools/testar-notificacao-cadastro.js --enviar   # manda de verdade
 *
 * Sem `--enviar` só mostra a configuração resolvida e o texto que sairia — dá
 * pra conferir destino e conteúdo sem tocar no WhatsApp. Com `--enviar`, passa
 * pelo caminho real (mesma função que o cadastro chama), com um nome fictício
 * bem visível pra ninguém confundir com cliente de verdade.
 *
 * Não cria família, não escreve nada além do log da própria mensagem enviada
 * (o mesmo `whatsappLogs` que toda resposta do bot grava).
 */

const { carregar } = require('./carregarAmbiente');

const CLIENTE_FICTICIO = { nome: '[TESTE] Ana Silva', telefone: '5511912345678' };

async function main() {
  const enviar = process.argv.includes('--enviar');

  const { faltando } = carregar(['EVOLUTION_API_KEY']);
  if (faltando.length) {
    console.warn(`Aviso: segredo(s) não carregado(s): ${faltando.join(', ')} — só importa se a família não tiver credencial própria.`);
  }

  const householdId = process.env.NOTIFICACAO_CADASTRO_HOUSEHOLD_ID || null;
  const destinoForcado = process.env.NOTIFICACAO_CADASTRO_DESTINO_JID || null;

  console.log('Aviso de cadastro — teste\n');

  if (!householdId) {
    console.log('NOTIFICACAO_CADASTRO_HOUSEHOLD_ID não está definida.');
    console.log('O aviso está DESLIGADO: nenhum cadastro gera notificação.');
    process.exit(1);
  }

  const { montarAvisoDeCadastro, destinoDe, notificarCadastro } = require('../src/services/notificacaoOperadorService');
  const whatsappConfigService = require('../src/services/whatsappConfigService');

  const config = await whatsappConfigService.getRawConfig(householdId);
  const destino = destinoDe(config, destinoForcado);

  const mascarar = (v) => (v ? String(v).replace(/^(\d{4})\d+(\d{4})/, '$1****$2') : '—');

  console.log(`família do operador   ${householdId}`);
  console.log(`canal ativo           ${config?.enabled ? 'sim' : 'NÃO'}`);
  console.log(`modo                  ${config?.modo || '—'}`);
  console.log(`destino               ${mascarar(destino)}${destino && destino === config?.groupId ? '  (GRUPO — o aviso seria visto por toda a família)' : '  (auto-conversa do operador)'}`);
  console.log('\n--- mensagem ---');
  console.log(montarAvisoDeCadastro(CLIENTE_FICTICIO));
  console.log('----------------\n');

  if (!enviar) {
    console.log('Simulação. Rode com --enviar para mandar de verdade.');
    process.exit(0);
  }

  const resultado = await notificarCadastro(CLIENTE_FICTICIO);
  console.log('resultado:', resultado);
  process.exit(resultado.enviado ? 0 : 1);
}

main().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
