/**
 * O núcleo de `@amber/track/server`, com a rede, o relógio e o agendador injetados. A entrada
 * pública (`server.ts`) liga as peças de verdade (`fetch`, `after()` do Next, `setTimeout`); os
 * testes ligam dublês. Nada aqui lança erro para a rota da página.
 */
import { montarCorpoLead, montarCorpoRelato, montarEntregaPagina } from "./corpos.js";
import { lerCookies } from "./formatos.js";
import { calcularIdempotencia } from "./idempotencia.js";
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
/** 4xx que repetir o mesmo corpo não muda. 408 e 429 podem mudar. */
const ehRecusaDefinitiva = (status) => status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
const ehTempoEsgotado = (erro) => erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
const respostaValida = (valor) => {
    if (!valor || typeof valor !== "object")
        return false;
    const r = valor;
    return typeof r.lead === "string" && (r.entrega === "pagina" || r.entrega === "track");
};
export function criarServidor(deps) {
    const pendentes = new Map();
    let avisouSemConfiguracao = false;
    function configuracao() {
        const { url, segredo } = deps.env();
        const base = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
        const s = typeof segredo === "string" ? segredo.trim() : "";
        if (!base || !s) {
            if (!avisouSemConfiguracao) {
                avisouSemConfiguracao = true;
                deps.avisar("[amber-track] AMBER_TRACK_URL ou AMBER_TRACK_SITE_SECRET ausente: o pacote não manda nada e a página entrega como hoje.");
            }
            return null;
        }
        return { base, segredo: s };
    }
    async function postar(base, segredo, caminho, corpo) {
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
            let json = null;
            try {
                json = await resposta.json();
            }
            catch (erro) {
                if (ehTempoEsgotado(erro))
                    return { erro: "tempo_esgotado" };
            }
            return { status: resposta.status, json };
        }
        catch (erro) {
            return { erro: ehTempoEsgotado(erro) ? "tempo_esgotado" : "rede" };
        }
    }
    async function enviarLead(base, segredo, corpo) {
        const r = await postar(base, segredo, "/api/track/v1/leads", corpo);
        if ("erro" in r)
            return r.erro === "tempo_esgotado" ? { tipo: "tempo_esgotado" } : { tipo: "recusado", status: null };
        if (r.status === 200 && respostaValida(r.json))
            return { tipo: "ok", resposta: r.json };
        return { tipo: "recusado", status: r.status };
    }
    /** Relato pela rota própria; 404 → mais uma vez, 30 s depois; de novo 404 → desiste. */
    async function enviarRelato(base, segredo, relato) {
        const corpo = montarCorpoRelato(relato);
        for (let tentativa = 1; tentativa <= 2; tentativa++) {
            const r = await postar(base, segredo, "/api/track/v1/leads/entrega-pagina", corpo);
            if (!("erro" in r) && r.status >= 200 && r.status < 300)
                return;
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
    function agendarReenvio(base, segredo, idempotencia, corpoBase) {
        if (!pendentes.has(idempotencia))
            pendentes.set(idempotencia, {});
        deps.agendar(async () => {
            let relatoQueSaiu;
            let chegou = false;
            try {
                await deps.esperar(ESPERA_REENVIO_MS);
                for (let tentativa = 1; tentativa <= TENTATIVAS_REENVIO; tentativa++) {
                    if (tentativa > 1)
                        await deps.esperar(ESPACO_REENVIO_MS);
                    const relato = pendentes.get(idempotencia)?.relato;
                    const corpo = { ...corpoBase, reenvio: true };
                    if (relato)
                        corpo.entrega_pagina = montarEntregaPagina(relato);
                    const desfecho = await enviarLead(base, segredo, corpo);
                    if (desfecho.tipo === "ok") {
                        chegou = true;
                        relatoQueSaiu = relato;
                        break;
                    }
                    if (desfecho.tipo === "recusado" && ehRecusaDefinitiva(desfecho.status))
                        break;
                }
            }
            catch {
                // nunca sobe
            }
            finally {
                const relato = pendentes.get(idempotencia)?.relato;
                pendentes.delete(idempotencia);
                // O relato chegou depois do corpo que saiu (ou o reenvio não chegou): vai pela rota própria.
                if (relato && (!chegou || relato !== relatoQueSaiu)) {
                    try {
                        await enviarRelato(base, segredo, relato);
                    }
                    catch {
                        // nunca sobe
                    }
                }
            }
        });
    }
    async function capturarLead(request, entrada) {
        let leadRef = null;
        const paraAPagina = (motivo) => ({
            registrado: false,
            leadId: null,
            leadRef,
            entregaPelaPagina: true,
            motivo,
        });
        try {
            const config = configuracao();
            if (!config)
                return paraAPagina("sem_configuracao");
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
        }
        catch {
            return paraAPagina("recusado");
        }
    }
    async function relatarEntregaDaPagina(relato) {
        try {
            const config = configuracao();
            if (!config)
                return;
            // Reenvio tardio pendente para o mesmo envio: o relato vai junto com ele, sem chamada separada.
            const pendente = relato.leadRef ? pendentes.get(relato.leadRef) : undefined;
            if (pendente) {
                pendente.relato = relato;
                return;
            }
            deps.agendar(async () => {
                try {
                    await enviarRelato(config.base, config.segredo, relato);
                }
                catch {
                    // nunca sobe
                }
            });
        }
        catch {
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
