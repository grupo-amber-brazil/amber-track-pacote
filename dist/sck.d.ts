import type { GatewayDoSck, Utms } from "./tipos.js";
/** Limite observado do `sck` da Hotmart (a doc não diz o teto). */
export declare const TETO_DO_SCK = 255;
/**
 * Monta o `sck` com o clique explícito. `montarSck` (entrada `client`) lê o clique do cookie
 * `_atk` e chama esta. `abv` e `atk` fora do formato contam como ausentes.
 */
export declare function montarSckCom(gateway: GatewayDoSck, utms: Utms, abv: string | null | undefined, atk: string | null | undefined): string;
