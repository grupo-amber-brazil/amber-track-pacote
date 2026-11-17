"use client";
/**
 * `@amber/track/client`: a visita e o `sck` do checkout, no navegador.
 *
 * ```tsx
 * import { AmberTrackVisita, montarSck } from "@amber/track/client"
 * <AmberTrackVisita ponto="pc_…" />
 * const sck = montarSck("hotmart", utms, abv)
 * ```
 */
import { useEffect } from "react";
import { COOKIE_DO_CLIQUE, lerCookies } from "./formatos.js";
import { montarSckCom } from "./sck.js";
import { criarRegistroDeVisitas } from "./visita.js";
import { ENDERECO_PADRAO } from "./versao.js";
const registrarVisita = criarRegistroDeVisitas();
/**
 * `https://dash.grupoamber.com.br`, ou `NEXT_PUBLIC_AMBER_TRACK_URL` quando definida (teste
 * local). A expressão `process.env.NEXT_PUBLIC_AMBER_TRACK_URL` fica literal para o Next
 * trocá-la pelo valor no build.
 */
function enderecoDaApi() {
    let url;
    try {
        url = process.env.NEXT_PUBLIC_AMBER_TRACK_URL;
    }
    catch {
        url = undefined;
    }
    const limpo = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
    return limpo || ENDERECO_PADRAO;
}
function ambienteAtual() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    return {
        href: window.location.href,
        cookie: document.cookie,
        referrer: document.referrer,
        sendBeacon: nav && typeof nav.sendBeacon === "function" ? nav.sendBeacon.bind(nav) : undefined,
        fetch: typeof fetch === "function" ? fetch.bind(window) : undefined,
    };
}
/**
 * Sem nada na tela. Ao montar, manda uma visita do ponto por carregamento de página.
 */
export function AmberTrackVisita(props) {
    const { ponto } = props;
    useEffect(() => {
        try {
            registrarVisita(ponto, ambienteAtual(), enderecoDaApi());
        }
        catch {
            // nenhum erro sobe para a tela
        }
    }, [ponto]);
    return null;
}
/**
 * `sck` do checkout. Lê o clique do cookie `_atk`; `abv` é o visitante que a página já tem.
 * Hotmart: `utm_source|utm_medium|utm_campaign|utm_content|utm_term|abv_…|clk_…`.
 * Guru: `abv_…|clk_…`, sem UTM.
 */
export function montarSck(gateway, utms, abv) {
    let atk;
    try {
        atk = typeof document !== "undefined" ? lerCookies(document.cookie).get(COOKIE_DO_CLIQUE) : undefined;
    }
    catch {
        atk = undefined;
    }
    return montarSckCom(gateway, utms, abv, atk);
}
