import { describe, it, expect } from 'vitest';

/**
 * Trava que impede um teste de conectar no Firestore de producao.
 *
 * Existe porque um vi.mock que silenciosamente nao pegou fez a suite escrever
 * quatro documentos falsos na colecao transactions de producao. Mock que falha
 * em silencio e perigoso; a conexao real recusando existir sob teste nao e.
 */
describe('trava anti-producao', () => {
  it('recusa carregar o firebaseAdmin real dentro de um teste', async () => {
    await expect(import('../config/firebaseAdmin.js')).rejects.toThrow(/PRODUÇÃO/);
  });
});
