import { NextResponse, type NextRequest } from "next/server";
import { comAmberTrack } from "@amber/track/proxy";

const VISITANTE = /^abv_[a-z0-9]{16}$/;
const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `abv_` + 16 minúsculas ou dígitos, no formato do rastreamento de páginas. */
function novoVisitante(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let saida = "abv_";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Só no exemplo: grava um `_abv` de teste quando não existe, para provar o par clique ↔
  // visitante. Numa LP da Amanda, quem grava o `_abv` é o `proxy.ts` dela, não o pacote.
  if (!VISITANTE.test(request.cookies.get("_abv")?.value ?? "")) {
    response.cookies.set({
      name: "_abv",
      value: novoVisitante(),
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
      secure: true,
    });
  }

  // O que o pacote acrescenta: o cookie `_atk` do clique, gravado no servidor.
  return comAmberTrack(request, response);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
