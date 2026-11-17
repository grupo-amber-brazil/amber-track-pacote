import type { EntradaLead, RelatoDaPagina, ResultadoLead } from "./tipos.js";
/** Limite de cada chamada à API. A página nunca espera mais que isso. */
export declare const LIMITE_MS = 2000;
/** Espera antes do reenvio tardio. */
export declare const ESPERA_REENVIO_MS = 10000;
/** Espaço entre as tentativas do reenvio tardio. */
export declare const ESPACO_REENVIO_MS = 5000;
/** Tentativas do reenvio tardio. */
export declare const TENTATIVAS_REENVIO = 3;
/** Espera antes da segunda tentativa do relato que recebeu 404. */
export declare const ESPERA_RELATO_404_MS = 30000;
export type Dependencias = {
    fetch: typeof fetch;
    /** Roda a tarefa depois da resposta (o `after()` do Next) ou, sem ele, solta, sem `await`. */
    agendar: (tarefa: () => Promise<void>) => void;
    esperar: (ms: number) => Promise<void>;
    agora: () => number;
    /** As envs do site. Lidas a cada chamada: o teste e o processo podem mudar. */
    env: () => {
        url?: string;
        segredo?: string;
    };
    avisar: (mensagem: string) => void;
    /** Sinal que aborta a chamada em `LIMITE_MS`. */
    sinal: (ms: number) => AbortSignal;
};
export declare function criarServidor(deps: Dependencias): {
    capturarLead: (request: Request, entrada: EntradaLead) => Promise<ResultadoLead>;
    relatarEntregaDaPagina: (relato: RelatoDaPagina) => Promise<void>;
    /** Só para teste: quantos reenvios ainda não saíram. */
    reenviosPendentes: () => number;
};
