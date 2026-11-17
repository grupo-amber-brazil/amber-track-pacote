import type { CorpoVisita } from "./tipos.js";
/** Teto do corpo da visita na API. */
export declare const TETO_DA_VISITA_BYTES = 4096;
export type AmbienteDoNavegador = {
    /** `location.href` */
    href: string;
    /** `document.cookie` */
    cookie: string;
    /** `document.referrer` */
    referrer: string;
    sendBeacon?: (url: string, dados: Blob) => boolean;
    fetch?: typeof fetch;
};
/** Corpo da visita: ponto, caminho, UTMs da URL, `atk` (query ou cookie), `abv` (cookie) e o host de origem. */
export declare function montarCorpoVisita(ponto: string, ambiente: Pick<AmbienteDoNavegador, "href" | "cookie" | "referrer">): CorpoVisita;
/**
 * Trava em memória do módulo: uma visita por ponto e caminho em cada carregamento de página.
 * Segura o `useEffect` duplo do React em desenvolvimento.
 */
export declare function criarRegistroDeVisitas(): (ponto: string, ambiente: AmbienteDoNavegador, endereco: string) => boolean;
