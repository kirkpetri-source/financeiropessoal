import { describe, it, expect, beforeEach } from 'vitest';
import { criarDuble } from '../__testes__/dubleDeBanco.mjs';
import { criarAlertaOperacional, idDoAlerta, COLECAO } from './alertaOperacionalService.js';

const AGORA = new Date('2026-08-22T06:00:00Z');

let duble;
let alerta;

beforeEach(() => {
  duble = criarDuble({});
  alerta = criarAlertaOperacional({ db: duble.db, agora: () => AGORA });
});

function doc(rotina, quando = AGORA) {
  return duble.estado.documentos[`${COLECAO}/${idDoAlerta(rotina, quando)}`];
}

describe('vigiar — a rotina que falha vira aviso na tela', () => {
  it('rotina que funciona não gera aviso nenhum', async () => {
    const r = await alerta.vigiar('backup', async () => ({ ok: 1 }));

    expect(r).toEqual({ ok: 1 });
    expect(doc('backup')).toBeUndefined();
  });

  it('rotina que quebra vira registro pendente, com a mensagem do erro', async () => {
    const r = await alerta.vigiar('backup', async () => { throw new Error('bucket sumiu'); });

    expect(r).toBeNull();
    expect(doc('backup')).toMatchObject({
      tipo: 'ROTINA_FALHOU',
      rotina: 'backup',
      erro: 'bucket sumiu',
      resolvida: false,
      ocorrencias: 1,
    });
  });

  it('falhar de novo no mesmo dia CONTA, em vez de encher a tela de repetido', async () => {
    await alerta.vigiar('backup', async () => { throw new Error('primeira'); });
    await alerta.vigiar('backup', async () => { throw new Error('segunda'); });

    const registros = Object.keys(duble.estado.documentos).filter((k) => k.startsWith(COLECAO));
    expect(registros).toHaveLength(1);
    expect(doc('backup')).toMatchObject({ ocorrencias: 2, erro: 'segunda' });
  });

  it('rotinas diferentes têm avisos diferentes', async () => {
    await alerta.vigiar('backup', async () => { throw new Error('a'); });
    await alerta.vigiar('faturas', async () => { throw new Error('b'); });

    expect(doc('backup')).toBeDefined();
    expect(doc('faturas')).toBeDefined();
  });

  it('dias diferentes geram avisos diferentes — o de ontem não esconde o de hoje', () => {
    const ontem = new Date('2026-08-21T06:00:00Z');
    expect(idDoAlerta('backup', ontem)).not.toBe(idDoAlerta('backup', AGORA));
  });

  it('erro sem mensagem não vira registro quebrado', async () => {
    await alerta.vigiar('backup', async () => { throw new Error(); });

    expect(doc('backup').erro).toBe('erro sem mensagem');
  });

  it('banco fora do ar NÃO derruba a rotina que o alerta vigia', async () => {
    const quebrado = criarAlertaOperacional({
      db: { collection: () => { throw new Error('firestore fora'); } },
      agora: () => AGORA,
    });

    // A rotina falhou E o alerta falhou. Mesmo assim, nada é lançado para cima:
    // a agendada não pode morrer por causa do vigia.
    await expect(quebrado.vigiar('backup', async () => { throw new Error('x'); }))
      .resolves.toBeNull();
  });
});
