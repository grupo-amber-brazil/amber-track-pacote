/**
 * Formato do `sck` do checkout: contrato do Amber Track, testado aqui (`test/sck.test.ts`).
 *
 * - Hotmart: `utm_source|utm_medium|utm_campaign|utm_content|utm_term|abv_…|clk_…`. Sem `abv`, o
 *   sexto campo fica vazio; sem clique, o sétimo some. `|` e espaço saem dos valores. Passou de
 *   255 caracteres: encurta `utm_term`, depois `utm_content`, `utm_campaign`, `utm_medium` e
 *   `utm_source`; `abv_` e `clk_` nunca são cortados.
 * - Guru: `abv_…|clk_…`, ou só um dos dois. Nunca UTM.
 *
 * O `clk_` vai depois das UTMs porque a Dash lê a origem da venda no primeiro campo, e depois do
 * `abv_` porque o `abv_` é lido por regex em qualquer posição.
 */
import { ehCodigoDoClique, ehVisitante } from "./formatos.js";
import type { GatewayDoSck, Utms } from "./tipos.js";

/** Limite observado do `sck` da Hotmart (a doc não diz o teto). */
export const TETO_DO_SCK = 255;

const ORDEM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
/** Ordem do corte: o último campo das UTMs encurta primeiro. */
const ORDEM_DO_CORTE = [4, 3, 2, 1, 0] as const;

const limpar = (valor: string | null | undefined): string =>
  typeof valor === "string" ? valor.replace(/[|\s]/g, "") : "";

/**
 * Monta o `sck` com o clique explícito. `montarSck` (entrada `client`) lê o clique do cookie
 * `_atk` e chama esta. `abv` e `atk` fora do formato contam como ausentes.
 */
export function montarSckCom(
  gateway: GatewayDoSck,
  utms: Utms,
  abv: string | null | undefined,
  atk: string | null | undefined,
): string {
  const visitante = ehVisitante(abv) ? abv : "";
  const clique = ehCodigoDoClique(atk) ? atk : "";

  if (gateway === "guru") return [visitante, clique].filter(Boolean).join("|");

  const campos: string[] = ORDEM.map((chave) => limpar(utms?.[chave]));
  const juntar = () => [...campos, visitante, ...(clique ? [clique] : [])].join("|");

  let sck = juntar();
  for (const indice of ORDEM_DO_CORTE) {
    if (sck.length <= TETO_DO_SCK) break;
    const excesso = sck.length - TETO_DO_SCK;
    campos[indice] = campos[indice].slice(0, Math.max(0, campos[indice].length - excesso));
    sck = juntar();
  }
  return sck;
}
