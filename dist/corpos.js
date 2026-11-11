/**
 * Montagem dos corpos que o servidor da página manda à API v1. Funções puras: nenhuma rede,
 * nenhum relógio. Os tetos abaixo são os da API (`contrato-v1.json`); o pacote corta antes de
 * mandar para um texto comprido demais não fazer a API recusar o lead inteiro.
 */
import { COOKIE_DO_CLIQUE, COOKIE_DO_VISITANTE, ehCodigoDoClique, ehVisitante, textoOuNada, } from "./formatos.js";
const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
/** Caminho sem query nem fragmento, até 200. */
export function caminhoSemQuery(valor) {
    if (typeof valor !== "string")
        return undefined;
    const corte = valor.search(/[?#]/);
    return textoOuNada(corte >= 0 ? valor.slice(0, corte) : valor, 200);
}
function contatoDoLead(contato) {
    const saida = {};
    const nome = textoOuNada(contato?.nome, 120);
    const email = textoOuNada(contato?.email, 254);
    const telefone = textoOuNada(contato?.telefone, 40);
    if (nome !== undefined)
        saida.nome = nome;
    if (email !== undefined)
        saida.email = email;
    if (telefone !== undefined)
        saida.telefone = telefone;
    return saida;
}
function camposDoLead(campos) {
    if (!campos || typeof campos !== "object")
        return undefined;
    const saida = {};
    for (const [chave, valor] of Object.entries(campos)) {
        if (typeof valor !== "string")
            continue;
        saida[chave] = valor.length > 500 ? valor.slice(0, 500) : valor;
    }
    return Object.keys(saida).length > 0 ? saida : undefined;
}
/**
 * Corpo de `POST /api/track/v1/leads`. `cookies` é o que veio no request da página: o `_atk`
 * entra quando `marcas.atk` não veio; o `_abv`, quando tem o formato (a API recusa `abv` fora
 * do formato, e o lead não pode se perder por isso).
 */
export function montarCorpoLead(entrada, cookies, idempotencia) {
    const corpo = {
        ponto: entrada.ponto,
        idempotencia,
        contato: contatoDoLead(entrada.contato),
    };
    const campos = camposDoLead(entrada.campos);
    if (campos)
        corpo.campos = campos;
    const marcas = {};
    const m = entrada.marcas ?? {};
    for (const utm of UTMS) {
        const v = textoOuNada(m[utm], 255);
        if (v !== undefined)
            marcas[utm] = v;
    }
    const fbclid = textoOuNada(m.fbclid, 500);
    if (fbclid !== undefined)
        marcas.fbclid = fbclid;
    const fbp = textoOuNada(m.fbp, 500);
    if (fbp !== undefined)
        marcas.fbp = fbp;
    const pagina = caminhoSemQuery(m.pagina);
    if (pagina !== undefined)
        marcas.pagina = pagina;
    const referrerHost = textoOuNada(m.referrer_host, 255);
    if (referrerHost !== undefined)
        marcas.referrer_host = referrerHost;
    // `marcas.atk`, se vier, vence o cookie. A API descarta `atk` fora do formato e conta no log.
    const atkDaMarca = textoOuNada(m.atk, 64);
    const atkDoCookie = cookies.get(COOKIE_DO_CLIQUE);
    if (atkDaMarca !== undefined)
        marcas.atk = atkDaMarca;
    else if (ehCodigoDoClique(atkDoCookie))
        marcas.atk = atkDoCookie;
    const abv = cookies.get(COOKIE_DO_VISITANTE);
    if (ehVisitante(abv))
        marcas.abv = abv;
    if (Object.keys(marcas).length > 0)
        corpo.marcas = marcas;
    return corpo;
}
/** O relato como vai dentro do reenvio tardio (`entrega_pagina`). */
export function montarEntregaPagina(relato) {
    const corpo = {
        resultado: relato.resultado,
        tags: Array.isArray(relato.tags) ? relato.tags.filter((t) => typeof t === "string") : [],
        lista: typeof relato.lista === "number" && Number.isInteger(relato.lista) ? relato.lista : null,
    };
    const detalhe = textoOuNada(relato.detalhe, 200);
    if (detalhe !== undefined)
        corpo.detalhe = detalhe;
    return corpo;
}
/** Corpo de `POST /api/track/v1/leads/entrega-pagina`. Sem `leadRef`, só o contato. */
export function montarCorpoRelato(relato) {
    const contato = {};
    const email = textoOuNada(relato.contato?.email, 254);
    const telefone = textoOuNada(relato.contato?.telefone, 40);
    if (email !== undefined)
        contato.email = email;
    if (telefone !== undefined)
        contato.telefone = telefone;
    const { resultado, tags, lista, detalhe } = montarEntregaPagina(relato);
    const corpo = { ponto: relato.ponto, contato, resultado, tags, lista };
    if (typeof relato.leadRef === "string" && relato.leadRef)
        corpo.lead_ref = relato.leadRef;
    if (detalhe !== undefined)
        corpo.detalhe = detalhe;
    // Ordem das chaves igual à da API, para o corpo ler igual ao do contrato.
    return ordenar(corpo, ["ponto", "lead_ref", "contato", "resultado", "tags", "lista", "detalhe"]);
}
function ordenar(obj, ordem) {
    const saida = {};
    for (const chave of ordem)
        if (chave in obj)
            saida[chave] = obj[chave];
    for (const [chave, valor] of Object.entries(obj))
        if (!(chave in saida))
            saida[chave] = valor;
    return saida;
}
