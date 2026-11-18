/**
 * Link do botão "Próximo passo" de uma Página do Amber Track: regra pura, testada em
 * `test/proximo-passo.test.ts` (Dashboard BI, `.specs/#102` 04 §2).
 *
 * Acrescenta `atk` (o clique desta visita) ao endereço `https:` do botão. O `atk` só liga ao clique
 * anterior quando é da mesma pessoa: a Dash confere; o pacote só repassa (decisão 12). Todo caminho
 * sem mudança devolve a `url` recebida, não a normalizada, e nada lança.
 */
import { ehCodigoDoClique } from "./formatos.js";

/** `url` com `atk=<clk_…>` no fim da query. Sem clique válido, fora de `https:`, inválida ou já com `atk`: `url`. */
export function linkDoProximoPassoCom(url: string, atk: string | undefined): string {
  if (!ehCodigoDoClique(atk)) return url;
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return url;
  }
  if (alvo.protocol !== "https:") return url;
  if (alvo.searchParams.has("atk")) return url;
  alvo.searchParams.append("atk", atk);
  return alvo.toString();
}
