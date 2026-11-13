/**
 * Dublês do servidor para os testes: `fetch` gravado, agendador que guarda as tarefas, espera
 * que só anota o tempo. Nenhuma chamada de rede de verdade.
 */
import { criarServidor, type Dependencias } from "../src/server-nucleo.js";

export const PONTO = "pc_3J7Q2X9KMTB4R8DA";
export const SEGREDO = "ats_SEGREDOFICTICIODETESTE000000000";
export const BASE = "http://localhost:3000";
/** 10/11/2026 20:00:00 UTC, no meio de uma janela de 2 minutos. */
export const AGORA = Date.UTC(2026, 10, 10, 20, 0, 30);

export type Chamada = { url: string; init: RequestInit; corpo: Record<string, unknown> };
export type Responder = (chamada: Chamada) => Promise<Response> | Response;

export const json = (status: number, corpo: unknown): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

export const tempoEsgotado = (): never => {
  throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
};

export function montar(opcoes: {
  responder?: Responder;
  env?: { url?: string; segredo?: string };
  agora?: () => number;
  sinal?: Dependencias["sinal"];
} = {}) {
  const chamadas: Chamada[] = [];
  const agendadas: Array<() => Promise<void>> = [];
  const esperas: number[] = [];
  const avisos: string[] = [];
  let responder: Responder = opcoes.responder ?? (() => json(200, { lead: "lead-1", novo: true, entrega: "pagina" }));

  const servidor = criarServidor({
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body ?? "null"));
      const chamada = { url: String(url), init: init ?? {}, corpo };
      chamadas.push(chamada);
      return responder(chamada);
    }) as typeof fetch,
    agendar: (tarefa) => {
      agendadas.push(tarefa);
    },
    esperar: async (ms) => {
      esperas.push(ms);
    },
    agora: opcoes.agora ?? (() => AGORA),
    env: () => opcoes.env ?? { url: BASE, segredo: SEGREDO },
    avisar: (mensagem) => {
      avisos.push(mensagem);
    },
    sinal: opcoes.sinal ?? ((ms) => AbortSignal.timeout(ms)),
  });

  /** Roda o que o `after()` rodaria depois da resposta, inclusive o que for agendado no caminho. */
  async function rodarAgendadas(): Promise<void> {
    while (agendadas.length > 0) await agendadas.shift()!();
  }

  return {
    servidor,
    chamadas,
    agendadas,
    esperas,
    avisos,
    rodarAgendadas,
    trocarResposta(novo: Responder) {
      responder = novo;
    },
  };
}

export const pedidoDaPagina = (cookie?: string): Request =>
  new Request("http://localhost:3100/api/captura", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
