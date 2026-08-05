/**
 * Mapeamento entre a posição do item na checklist da Linha do Tempo e a página
 * real do design no Canva (DAHQCLRJQuM, 288 páginas).
 *
 * CONTEXTO
 * O bloco do Shikatsu (5 variantes) está fora de ordem no Canva: a checklist o
 * espera nas posições 168–172, mas no documento ele está nas páginas 218–222,
 * entre o Shin e o Shikure. Isso empurra tudo que vem entre esses dois pontos
 * 5 páginas para trás.
 *
 * Enquanto o Canva não for reordenado, use `paginaDoItem` para saber qual página
 * corresponde a cada item. Depois que as páginas 218–222 forem movidas para a
 * posição 168, o mapeamento vira identidade e este módulo pode ser removido —
 * troque por `DESIGN_REORDENADO = true`.
 *
 * Validado em 3 ago 2026 contra as 288 páginas exportadas: 288 páginas cobertas,
 * nenhuma repetida, nenhuma sobrando.
 */

/** Vire para `true` depois de mover as páginas 218–222 para a posição 168 no Canva. */
export const DESIGN_REORDENADO = false;

/** Posições (1-indexadas) que a checklist reserva ao bloco do Shikatsu. */
export const BLOCO_FORA_DE_ORDEM = { de: 168, ate: 172, paginaInicial: 218 } as const;

/**
 * Converte a posição 1-indexada do item na checklist ordenada por `order`
 * na página 1-indexada do Canva.
 */
export function paginaDoItem(posicao: number): number {
  if (DESIGN_REORDENADO) return posicao;
  const { de, ate, paginaInicial } = BLOCO_FORA_DE_ORDEM;
  if (posicao <= de - 1) return posicao;              // 1–167: em ordem
  if (posicao <= ate) return paginaInicial + (posicao - de); // 168–172 -> 218–222
  if (posicao <= 222) return posicao - 5;             // 173–222: empurrados 5 atrás
  return posicao;                                     // 223–288: em ordem
}

/** True quando o item faz parte do bloco que está fora de ordem no Canva. */
export function estaForaDeOrdem(posicao: number): boolean {
  return !DESIGN_REORDENADO
    && posicao >= BLOCO_FORA_DE_ORDEM.de
    && posicao <= BLOCO_FORA_DE_ORDEM.ate;
}

export type SituacaoItem =
  | 'confere'        // checklist e design concordam
  | 'falta-marcar'   // página tem arte, item está pendente na checklist
  | 'marcado-vazio'; // item marcado como feito, página em branco (não deve ocorrer)

export function situacaoDoItem(done: boolean, paginaTemArte: boolean): SituacaoItem {
  if (done === paginaTemArte) return 'confere';
  return done ? 'marcado-vazio' : 'falta-marcar';
}
