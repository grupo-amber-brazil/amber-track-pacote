/**
 * `@amber/track/proxy`: o cookie do clique, gravado no servidor.
 *
 * ```ts
 * // proxy.ts (Next 16) ou middleware.ts
 * import { comAmberTrack } from "@amber/track/proxy"
 * export function proxy(request: NextRequest) {
 *   return comAmberTrack(request, NextResponse.next())
 * }
 * ```
 *
 * Por que no servidor: cookie escrito por JavaScript dura 24 horas no Safari quando a página
 * chega por link decorado. Escrito pelo servidor, dura os 30 dias.
 */
import type { NextRequest, NextResponse } from "next/server.js";
import { COOKIE_DO_CLIQUE, ehCodigoDoClique } from "./formatos.js";

/** 30 dias: cobre a janela padrão de atribuição. */
export const VALIDADE_DO_COOKIE_S = 30 * 24 * 60 * 60;

/**
 * Lê `atk` da query. Com o formato `clk_`, grava o cookie `_atk` (Path=/, 30 dias, Secure,
 * SameSite=Lax, sem HttpOnly, sem Domain); com outro formato, ignora. Mesmo valor já gravado:
 * não manda `Set-Cookie`. Valor diferente: sobrescreve (o clique mais novo vence).
 * Não redireciona, não tira o `atk` da URL e não mexe em nenhum outro cookie. Nunca lança erro.
 */
export function comAmberTrack(request: NextRequest, response: NextResponse): NextResponse {
  try {
    const atk = request.nextUrl.searchParams.get("atk");
    if (!ehCodigoDoClique(atk)) return response;
    if (request.cookies.get(COOKIE_DO_CLIQUE)?.value === atk) return response;
    response.cookies.set({
      name: COOKIE_DO_CLIQUE,
      value: atk,
      path: "/",
      maxAge: VALIDADE_DO_COOKIE_S,
      secure: true,
      sameSite: "lax",
      httpOnly: false,
    });
  } catch {
    // o proxy da página nunca quebra por causa do pacote
  }
  return response;
}
