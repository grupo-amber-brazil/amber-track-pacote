import type { CorpoEntregaPagina, CorpoLead, CorpoRelato, EntradaLead, RelatoDaPagina } from "./tipos.js";
/** Caminho sem query nem fragmento, até 200. */
export declare function caminhoSemQuery(valor: unknown): string | undefined;
/**
 * Corpo de `POST /api/track/v1/leads`. `cookies` é o que veio no request da página: o `_atk`
 * entra quando `marcas.atk` não veio; o `_abv`, quando tem o formato (a API recusa `abv` fora
 * do formato, e o lead não pode se perder por isso).
 */
export declare function montarCorpoLead(entrada: EntradaLead, cookies: Map<string, string>, idempotencia: string): CorpoLead;
/** O relato como vai dentro do reenvio tardio (`entrega_pagina`). */
export declare function montarEntregaPagina(relato: RelatoDaPagina): CorpoEntregaPagina;
/** Corpo de `POST /api/track/v1/leads/entrega-pagina`. Sem `leadRef`, só o contato. */
export declare function montarCorpoRelato(relato: RelatoDaPagina): CorpoRelato;
