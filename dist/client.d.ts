import type { GatewayDoSck, Utms } from "./tipos.js";
export type { CorpoVisita, GatewayDoSck, Utms } from "./tipos.js";
/**
 * Sem nada na tela. Ao montar, manda uma visita do ponto por carregamento de página.
 */
export declare function AmberTrackVisita(props: {
    ponto: string;
}): null;
/**
 * `sck` do checkout. Lê o clique do cookie `_atk`; `abv` é o visitante que a página já tem.
 * Hotmart: `utm_source|utm_medium|utm_campaign|utm_content|utm_term|abv_…|clk_…`.
 * Guru: `abv_…|clk_…`, sem UTM.
 */
export declare function montarSck(gateway: GatewayDoSck, utms: Utms, abv: string | null): string;
/** O link do botão "Próximo passo" com o clique desta visita. Sem `_atk`, devolve a URL como veio. */
export declare function linkDoProximoPasso(url: string): string;
