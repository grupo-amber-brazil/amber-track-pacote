/**
 * `@amber/track/server`: a rota de captura da página.
 *
 * ```ts
 * import { capturarLead, relatarEntregaDaPagina } from "@amber/track/server"
 *
 * const r = await capturarLead(request, { ponto: "pc_…", contato, campos, marcas })
 * if (r.entregaPelaPagina) {
 *   // caminho de hoje até o ActiveCampaign
 *   await relatarEntregaDaPagina({ leadRef: r.leadRef, ponto: "pc_…", contato, resultado: "ok", tags, lista })
 * }
 * ```
 *
 * Envs do site: `AMBER_TRACK_URL` e `AMBER_TRACK_SITE_SECRET`. Sem as duas, nada é chamado e a
 * página segue como hoje.
 */
import { after } from "next/server.js";
import { criarServidor } from "./server-nucleo.js";
import type { EntradaLead, RelatoDaPagina, ResultadoLead } from "./tipos.js";

export type { EntradaLead, RelatoDaPagina, ResultadoLead } from "./tipos.js";

/**
 * `after()` do Next roda a tarefa depois de a resposta terminar. Fora do escopo de um request
 * (ou num Next sem `after`), ele lança; aí a promessa segue solta, sem `await`.
 */
function agendar(tarefa: () => Promise<void>): void {
  const solta = () => {
    void tarefa().catch(() => undefined);
  };
  try {
    if (typeof after === "function") {
      after(() => tarefa().catch(() => undefined));
      return;
    }
  } catch {
    // sem escopo de request
  }
  solta();
}

const servidor = criarServidor({
  fetch: (...args) => fetch(...args),
  agendar,
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  agora: () => Date.now(),
  env: () => ({ url: process.env.AMBER_TRACK_URL, segredo: process.env.AMBER_TRACK_SITE_SECRET }),
  avisar: (mensagem) => console.warn(mensagem),
  sinal: (ms) => AbortSignal.timeout(ms),
});

/**
 * Manda o lead ao Amber Track e diz quem entrega ao ActiveCampaign. Nunca lança erro e nunca
 * segura a página mais que 2 s. Em qualquer desfecho que não seja 200, devolve
 * `entregaPelaPagina: true` e manda o mesmo lead de novo 10 s depois, com a mesma chave.
 */
export function capturarLead(request: Request, entrada: EntradaLead): Promise<ResultadoLead> {
  return servidor.capturarLead(request, entrada);
}

/**
 * Relata o que a página fez no caminho dela. Roda depois da resposta (`after()`), nunca lança
 * erro. Se o reenvio tardio do mesmo envio ainda não saiu neste processo, vai junto com ele.
 */
export function relatarEntregaDaPagina(relato: RelatoDaPagina): Promise<void> {
  return servidor.relatarEntregaDaPagina(relato);
}
