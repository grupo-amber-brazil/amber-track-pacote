/**
 * Formatos dos códigos que o pacote lê e manda. São os mesmos da Dash:
 * - `clk_`: código do clique, `clk_` + 16 símbolos do alfabeto Crockford base32 sem I, L, O e U;
 * - `pc_`: chave pública do ponto de captura, mesmo alfabeto;
 * - `abv_`: visitante do rastreamento de páginas, `abv_` + 16 minúsculas ou dígitos.
 */
export declare const CODIGO_DO_CLIQUE: RegExp;
export declare const CHAVE_DO_PONTO: RegExp;
export declare const VISITANTE: RegExp;
/** E-mail aceito: texto, arroba, domínio com ponto e sem espaço. Mesmo teste da Dash (contrato `formatos.email`). */
export declare const EMAIL_VALIDO: RegExp;
/** Nome do cookie do clique. Gravado no servidor por `comAmberTrack`. */
export declare const COOKIE_DO_CLIQUE = "_atk";
/** Nome do cookie do visitante. Quem grava é o `proxy.ts` da página, nunca o pacote. */
export declare const COOKIE_DO_VISITANTE = "_abv";
export declare const ehCodigoDoClique: (valor: unknown) => valor is string;
export declare const ehVisitante: (valor: unknown) => valor is string;
/**
 * Lê um cabeçalho `Cookie` (ou o `document.cookie`) e devolve nome → valor.
 * O primeiro valor de cada nome vence, como no navegador.
 */
export declare function lerCookies(cabecalho: string | null | undefined): Map<string, string>;
/** Texto aparado e cortado num teto; vazio vira `undefined` (campo que não vai no corpo). */
export declare function textoOuNada(valor: unknown, teto: number): string | undefined;
