/**
 * Formatos dos códigos que o pacote lê e manda. São os mesmos da Dash:
 * - `clk_`: código do clique, `clk_` + 16 símbolos do alfabeto Crockford base32 sem I, L, O e U;
 * - `pc_`: chave pública do ponto de captura, mesmo alfabeto;
 * - `abv_`: visitante do rastreamento de páginas, `abv_` + 16 minúsculas ou dígitos.
 */
export const CODIGO_DO_CLIQUE = /^clk_[0-9A-HJKMNP-TV-Z]{16}$/;
export const CHAVE_DO_PONTO = /^pc_[0-9A-HJKMNP-TV-Z]{16}$/;
export const VISITANTE = /^abv_[a-z0-9]{16}$/;
/** E-mail aceito: texto, arroba, domínio com ponto e sem espaço. Mesmo teste da Dash (contrato `formatos.email`). */
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Nome do cookie do clique. Gravado no servidor por `comAmberTrack`. */
export const COOKIE_DO_CLIQUE = "_atk";
/** Nome do cookie do visitante. Quem grava é o `proxy.ts` da página, nunca o pacote. */
export const COOKIE_DO_VISITANTE = "_abv";

export const ehCodigoDoClique = (valor: unknown): valor is string =>
  typeof valor === "string" && CODIGO_DO_CLIQUE.test(valor);

export const ehVisitante = (valor: unknown): valor is string =>
  typeof valor === "string" && VISITANTE.test(valor);

/**
 * Lê um cabeçalho `Cookie` (ou o `document.cookie`) e devolve nome → valor.
 * O primeiro valor de cada nome vence, como no navegador.
 */
export function lerCookies(cabecalho: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cabecalho) return cookies;
  for (const parte of cabecalho.split(";")) {
    const igual = parte.indexOf("=");
    if (igual < 0) continue;
    const nome = parte.slice(0, igual).trim();
    if (!nome || cookies.has(nome)) continue;
    let valor = parte.slice(igual + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) valor = valor.slice(1, -1);
    try {
      valor = decodeURIComponent(valor);
    } catch {
      // valor com % solto: fica como veio
    }
    cookies.set(nome, valor);
  }
  return cookies;
}

/** Texto aparado e cortado num teto; vazio vira `undefined` (campo que não vai no corpo). */
export function textoOuNada(valor: unknown, teto: number): string | undefined {
  if (typeof valor !== "string") return undefined;
  const aparado = valor.trim();
  if (!aparado) return undefined;
  return aparado.length > teto ? aparado.slice(0, teto).trimEnd() : aparado;
}
