/**
 * O núcleo de `@amber/track/server`, com a rede, o relógio e o agendador injetados. A entrada
 * pública (`server.ts`) liga as peças de verdade (`fetch`, `after()` do Next, `setTimeout`); os
 * testes ligam dublês. Nada aqui lança erro para a rota da página.
 */
import { montarCorpoLead, montarCorpoRelato, montarEntregaPagina } from "./corpos.js";
import { lerCookies } from "./formatos.js";
import { calcularIdempotencia } from "./idempotencia.js";
import type {
  CorpoLead,
  EntradaLead,
  MotivoDoResultado,
  RelatoDaPagina,
  RespostaLead,
  ResultadoLead,
} from "./tipos.js";
import { VERSAO_DA_API, VERSAO_DO_PACOTE } from "./versao.js";

/** Limite de cada chamada à API. A página nunca espera mais que isso. */
export const LIMITE_MS = 2_000;
/** Espera antes do reenvio tardio. */
export const ESPERA_REENVIO_MS = 10_000;
/** Espaço entre as tentativas do reenvio tardio. */
export const ESPACO_REENVIO_MS = 5_000;
/** Tentativas do reenvio tardio. */
export const TENTATIVAS_REENVIO = 3;
/** Espera antes da segunda tentativa do relato que recebeu 404. */
export const ESPERA_RELATO_404_MS = 30_000;

export type Dependencias = {
  fetch: typeof fetch;
  /** Roda a tarefa depois da resposta (o `after()` do Next) ou, sem ele, solta, sem `await`. */
  agendar: (tarefa: () => Promise<void>) => void;
  esperar: (ms: number) => Promise<void>;
  agora: () => number;
  /** As envs do site. Lidas a cada chamada: o teste e o processo podem mudar. */
  env: () => { url?: string; segredo?: string };
  avisar: (mensagem: string) => void;
  /** Sinal que aborta a chamada em `LIMITE_MS`. */
  sinal: (ms: number) => AbortSignal;
};

type Desfecho =
  | { tipo: "ok"; resposta: RespostaLead }
  | { tipo: "tempo_esgotado" }
  | { tipo: "recusado"; status: number | null };

/** Reenvio tardio que ainda não saiu, e o relato que pegou carona nele. */
type Pendente = { relato?: RelatoDaPagina };

/** 4xx que repetir o mesmo corpo não muda. 408 e 429 podem mudar. */
const ehRecusaDefinitiva = (status: number | null): boolean =>
  status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;

const ehTempoEsgotado = (erro: unknown): boolean =>
  erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");

const respostaValida = (valor: unknown): valor is RespostaLead => {
  if (!valor || typeof valor !== "object") return false;
  const r = valor as Record<string, unknown>;
  return typeof r.lead === "string" && (r.entrega === "pagina" || r.entrega === "track");
};

export function criarServidor(deps: Dependencias) {
  const pendentes = new Map<string, Pendente>();
  let avisouSemConfiguracao = false;

  function configuracao(): { base: string; segredo: string } | null {
    const { url, segredo } = deps.env();
    const base = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
    const s = typeof segredo === "string" ? segredo.trim() : "";
    if (!base || !s) {
      if (!avisouSemConfiguracao) {
        avisouSemConfiguracao = true;
        deps.avisar(
          "[amber-track] AMBER_TRACK_URL ou AMBER_TRACK_SITE_SECRET ausente: o pacote não manda nada e a página entrega como hoje.",
        );
      }
      return null;
    }
    return { base, segredo: s };
  }

  async function postar(
    base: string,
    segredo: string,
    caminho: string,
    corpo: unknown,
  ): Promise<{ status: number; json: unknown } | { erro: "tempo_esgotado" | "rede" }> {
    try {
      const resposta = await deps.fetch(`${base}${caminho}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${segredo}`,
          "Content-Type": "application/json",
          "X-Amber-Track-Api": String(VERSAO_DA_API),
          "X-Amber-Track-Pacote": VERSAO_DO_PACOTE,
        },
        body: JSON.stringify(corpo),
        signal: deps.sinal(LIMITE_MS),
      });
      let json: unknown = null;
      try {
        json = await resposta.json();
      } catch (erro) {
        if (ehTempoEsgotado(erro)) return { erro: "tempo_esgotado" };
      }
      return { status: resposta.status, json };
    } catch (erro) {
      return { erro: ehTempoEsgotado(erro) ? "tempo_esgotado" : "rede" };
    }
  }

  async function enviarLead(base: string, segredo: string, corpo: CorpoLead): Promise<Desfecho> {
    const r = await postar(base, segredo, "/api/track/v1/leads", corpo);
    if ("erro" in r) return r.erro === "tempo_esgotado" ? { tipo: "tempo_esgotado" } : { tipo: "recusado", status: null };
    if (r.status === 200 && respostaValida(r.json)) return { tipo: "ok", resposta: r.json };
    return { tipo: "recusado", status: r.status };
  }

  /** Relato pela rota própria; 404 → mais uma vez, 30 s depois; de novo 404 → desiste. */
  async function enviarRelato(base: string, segredo: string, relato: RelatoDaPagina): Promise<void> {
    const corpo = montarCorpoRelato(relato);
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const r = await postar(base, segredo, "/api/track/v1/leads/entrega-pagina", corpo);
      if (!("erro" in r) && r.status >= 200 && r.status < 300) return;
      if (!("erro" in r) && r.status === 404 && tentativa === 1) {
        await deps.esperar(ESPERA_RELATO_404_MS);
        continue;
      }
      const como = "erro" in r ? r.erro : `HTTP ${r.status}`;
      // Sem dado pessoal: só o ponto (chave pública) e o desfecho.
      deps.avisar(`[amber-track] relato da página não gravado (ponto ${relato.ponto}): ${como}.`);
      return;
    }
  }

  function agendarReenvio(base: string, segredo: string, idempotencia: string, corpoBase: CorpoLead): void {
    if (!pendentes.has(idempotencia)) pendentes.set(idempotencia, {});
    deps.agendar(async () => {
      let relatoQueSaiu: RelatoDaPagina | undefined;
      let chegou = false;
      try {
        await deps.esperar(ESPERA_REENVIO_MS);
        for (let tentativa = 1; tentativa <= TENTATIVAS_REENVIO; tentativa++) {
          if (tentativa > 1) await deps.esperar(ESPACO_REENVIO_MS);
          const relato = pendentes.get(idempotencia)?.relato;
          const corpo: CorpoLead = { ...corpoBase, reenvio: true };
          if (relato) corpo.entrega_pagina = montarEntregaPagina(relato);
          const desfecho = await enviarLead(base, segredo, corpo);
          if (desfecho.tipo === "ok") {
            chegou = true;
            relatoQueSaiu = relato;
            break;
          }
          if (desfecho.tipo === "recusado" && ehRecusaDefinitiva(desfecho.status)) break;
        }
      } catch {
        // nunca sobe
      } finally {
        const relato = pendentes.get(idempotencia)?.relato;
        pendentes.delete(idempotencia);
        // O relato chegou depois do corpo que saiu (ou o reenvio não chegou): vai pela rota própria.
        if (relato && (!chegou || relato !== relatoQueSaiu)) {
          try {
            await enviarRelato(base, segredo, relato);
          } catch {
            // nunca sobe
          }
        }
      }
    });
  }

  async function capturarLead(request: Request, entrada: EntradaLead): Promise<ResultadoLead> {
    let leadRef: string | null = null;
    const paraAPagina = (motivo: MotivoDoResultado): ResultadoLead => ({
      registrado: false,
      leadId: null,
      leadRef,
      entregaPelaPagina: true,
      motivo,
    });
    try {
      const config = configuracao();
      if (!config) return paraAPagina("sem_configuracao");

      leadRef = calcularIdempotencia(entrada.ponto, entrada.contato ?? {}, deps.agora());
      const cookies = lerCookies(request?.headers?.get("cookie"));
      const corpo = montarCorpoLead(entrada, cookies, leadRef);

      const desfecho = await enviarLead(config.base, config.segredo, corpo);
      if (desfecho.tipo === "ok") {
        const pagina = desfecho.resposta.entrega === "pagina";
        return {
          registrado: true,
          leadId: desfecho.resposta.lead,
          leadRef,
          entregaPelaPagina: pagina,
          motivo: pagina ? "modo_pagina" : "track_entrega",
        };
      }
      agendarReenvio(config.base, config.segredo, leadRef, corpo);
      return paraAPagina(desfecho.tipo === "tempo_esgotado" ? "tempo_esgotado" : "recusado");
    } catch {
      return paraAPagina("recusado");
    }
  }

  async function relatarEntregaDaPagina(relato: RelatoDaPagina): Promise<void> {
    try {
      const config = configuracao();
      if (!config) return;
      // Reenvio tardio pendente para o mesmo envio: o relato vai junto com ele, sem chamada separada.
      const pendente = relato.leadRef ? pendentes.get(relato.leadRef) : undefined;
      if (pendente) {
        pendente.relato = relato;
        return;
      }
      deps.agendar(async () => {
        try {
          await enviarRelato(config.base, config.segredo, relato);
        } catch {
          // nunca sobe
        }
      });
    } catch {
      // nunca sobe
    }
  }

  return {
    capturarLead,
    relatarEntregaDaPagina,
    /** Só para teste: quantos reenvios ainda não saíram. */
    reenviosPendentes: () => pendentes.size,
  };
}
