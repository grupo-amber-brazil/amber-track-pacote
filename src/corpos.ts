/**
 * Montagem dos corpos que o servidor da página manda à API v1. Funções puras: nenhuma rede,
 * nenhum relógio. Os tetos abaixo são os da API (`contrato-v1.json`); o pacote corta ou descarta antes
 * de mandar o que a API recusaria (formato do telefone, chave de campo, tamanho), para o lead não
 * ser recusado inteiro.
 */
import {
  COOKIE_DO_CLIQUE,
  COOKIE_DO_VISITANTE,
  EMAIL_VALIDO,
  ehCodigoDoClique,
  ehVisitante,
  textoOuNada,
} from "./formatos.js";
import type {
  CorpoEntregaPagina,
  CorpoLead,
  CorpoRelato,
  EntradaLead,
  RelatoDaPagina,
} from "./tipos.js";

const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Caminho sem query nem fragmento, até 200. */
export function caminhoSemQuery(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const corte = valor.search(/[?#]/);
  return textoOuNada(corte >= 0 ? valor.slice(0, corte) : valor, 200);
}

const CHAVE_DE_CAMPO = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_CAMPOS = 30;
const MAX_TAGS = 20;

const emailValido = (email: string | undefined): email is string =>
  email !== undefined && email.length <= 254 && EMAIL_VALIDO.test(email);

const telefoneValido = (telefone: string | undefined): telefone is string => {
  if (telefone === undefined) return false;
  const digitos = telefone.replace(/\D/g, "").length;
  return digitos >= 10 && digitos <= 15;
};

/**
 * E-mail e telefone como a API aceita. A API recusa o corpo inteiro (422) por um contato fora
 * do formato; por isso, se um dos dois é inválido e o outro é válido, só o válido vai. Sem nenhum
 * válido, vai o que veio (a API decide e o pacote avisa no 4xx).
 */
function contatoSaneado(email: string | undefined, telefone: string | undefined) {
  const emailOk = emailValido(email);
  const telefoneOk = telefoneValido(telefone);
  if (emailOk && !telefoneOk) return { email, telefone: undefined };
  if (telefoneOk && !emailOk) return { email: undefined, telefone };
  return { email, telefone };
}

function contatoDoLead(contato: EntradaLead["contato"]): CorpoLead["contato"] {
  const saida: CorpoLead["contato"] = {};
  const nome = textoOuNada(contato?.nome, 120);
  const { email, telefone } = contatoSaneado(
    textoOuNada(contato?.email, 400),
    textoOuNada(contato?.telefone, 40),
  );
  if (nome !== undefined) saida.nome = nome;
  if (email !== undefined) saida.email = email;
  if (telefone !== undefined) saida.telefone = telefone;
  return saida;
}

/** Chave fora de `^[a-z][a-z0-9_]{0,39}$` e valor com mais de 500 caracteres saem; no máximo 30. */
function camposDoLead(campos: EntradaLead["campos"]): Record<string, string> | undefined {
  if (!campos || typeof campos !== "object") return undefined;
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (Object.keys(saida).length >= MAX_CAMPOS) break;
    if (typeof valor !== "string" || !CHAVE_DE_CAMPO.test(chave) || valor.length > 500) continue;
    saida[chave] = valor;
  }
  return Object.keys(saida).length > 0 ? saida : undefined;
}

/**
 * Corpo de `POST /api/track/v1/leads`. `cookies` é o que veio no request da página: o `_atk`
 * entra quando `marcas.atk` não veio; o `_abv`, quando tem o formato (a API recusa `abv` fora
 * do formato, e o lead não pode se perder por isso).
 */
export function montarCorpoLead(
  entrada: EntradaLead,
  cookies: Map<string, string>,
  idempotencia: string,
): CorpoLead {
  const corpo: CorpoLead = {
    ponto: entrada.ponto,
    idempotencia,
    contato: contatoDoLead(entrada.contato),
  };
  const campos = camposDoLead(entrada.campos);
  if (campos) corpo.campos = campos;

  const marcas: NonNullable<CorpoLead["marcas"]> = {};
  const m = entrada.marcas ?? {};
  for (const utm of UTMS) {
    const v = textoOuNada(m[utm], 255);
    if (v !== undefined) marcas[utm] = v;
  }
  const fbclid = textoOuNada(m.fbclid, 500);
  if (fbclid !== undefined) marcas.fbclid = fbclid;
  const fbp = textoOuNada(m.fbp, 500);
  if (fbp !== undefined) marcas.fbp = fbp;
  const pagina = caminhoSemQuery(m.pagina);
  if (pagina !== undefined) marcas.pagina = pagina;
  const referrerHost = textoOuNada(m.referrer_host, 255);
  if (referrerHost !== undefined) marcas.referrer_host = referrerHost;

  // `marcas.atk`, se vier, vence o cookie. A API descarta `atk` fora do formato e conta no log.
  const atkDaMarca = textoOuNada(m.atk, 64);
  const atkDoCookie = cookies.get(COOKIE_DO_CLIQUE);
  if (atkDaMarca !== undefined) marcas.atk = atkDaMarca;
  else if (ehCodigoDoClique(atkDoCookie)) marcas.atk = atkDoCookie;
  const abv = cookies.get(COOKIE_DO_VISITANTE);
  if (ehVisitante(abv)) marcas.abv = abv;

  if (Object.keys(marcas).length > 0) corpo.marcas = marcas;
  return corpo;
}

/** Tags não vazias, cada uma até 255, no máximo 20. */
function tagsDoRelato(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const saida: string[] = [];
  for (const t of tags) {
    const texto = textoOuNada(t, 255);
    if (texto !== undefined) saida.push(texto);
    if (saida.length >= MAX_TAGS) break;
  }
  return saida;
}

/** O relato como vai dentro do reenvio tardio (`entrega_pagina`). */
export function montarEntregaPagina(relato: RelatoDaPagina): CorpoEntregaPagina {
  const corpo: CorpoEntregaPagina = {
    resultado: relato.resultado,
    tags: tagsDoRelato(relato.tags),
    lista: typeof relato.lista === "number" && Number.isInteger(relato.lista) && relato.lista > 0 ? relato.lista : null,
  };
  const detalhe = textoOuNada(relato.detalhe, 200);
  if (detalhe !== undefined) corpo.detalhe = detalhe;
  return corpo;
}

/** Corpo de `POST /api/track/v1/leads/entrega-pagina`. Sem `leadRef`, só o contato. */
export function montarCorpoRelato(relato: RelatoDaPagina): CorpoRelato {
  const contato: CorpoRelato["contato"] = {};
  const { email, telefone } = contatoSaneado(
    textoOuNada(relato.contato?.email, 400),
    textoOuNada(relato.contato?.telefone, 40),
  );
  if (email !== undefined) contato.email = email;
  if (telefone !== undefined) contato.telefone = telefone;

  const { resultado, tags, lista, detalhe } = montarEntregaPagina(relato);
  const corpo: CorpoRelato = { ponto: relato.ponto, contato, resultado, tags, lista };
  if (typeof relato.leadRef === "string" && relato.leadRef) corpo.lead_ref = relato.leadRef;
  if (detalhe !== undefined) corpo.detalhe = detalhe;
  // Ordem das chaves igual à da API, para o corpo ler igual ao do contrato.
  return ordenar(corpo, ["ponto", "lead_ref", "contato", "resultado", "tags", "lista", "detalhe"]);
}

function ordenar<T extends object>(obj: T, ordem: string[]): T {
  const saida: Record<string, unknown> = {};
  for (const chave of ordem) if (chave in obj) saida[chave] = (obj as Record<string, unknown>)[chave];
  for (const [chave, valor] of Object.entries(obj)) if (!(chave in saida)) saida[chave] = valor;
  return saida as T;
}
