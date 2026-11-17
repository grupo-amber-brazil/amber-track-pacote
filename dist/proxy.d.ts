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
/** 30 dias: cobre a janela padrão de atribuição. */
export declare const VALIDADE_DO_COOKIE_S: number;
/**
 * Lê `atk` da query. Com o formato `clk_`, grava o cookie `_atk` (Path=/, 30 dias, Secure,
 * SameSite=Lax, sem HttpOnly, sem Domain); com outro formato, ignora. Mesmo valor já gravado:
 * não manda `Set-Cookie`. Valor diferente: sobrescreve (o clique mais novo vence).
 * Não redireciona, não tira o `atk` da URL e não mexe em nenhum outro cookie. Nunca lança erro.
 */
export declare function comAmberTrack(request: NextRequest, response: NextResponse): NextResponse;
