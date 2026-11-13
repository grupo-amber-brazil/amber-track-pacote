import type { EntradaLead, RelatoDaPagina, ResultadoLead } from "./tipos.js";
export type { EntradaLead, RelatoDaPagina, ResultadoLead } from "./tipos.js";
/**
 * Manda o lead ao Amber Track e diz quem entrega ao ActiveCampaign. Nunca lança erro e nunca
 * segura a página mais que 2 s. Em qualquer desfecho que não seja 200, devolve
 * `entregaPelaPagina: true` e manda o mesmo lead de novo 10 s depois, com a mesma chave.
 */
export declare function capturarLead(request: Request, entrada: EntradaLead): Promise<ResultadoLead>;
/**
 * Relata o que a página fez no caminho dela. Roda depois da resposta (`after()`), nunca lança
 * erro. Se o reenvio tardio do mesmo envio ainda não saiu neste processo, vai junto com ele.
 */
export declare function relatarEntregaDaPagina(relato: RelatoDaPagina): Promise<void>;
