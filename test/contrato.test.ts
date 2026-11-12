import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { montarCorpoLead, montarCorpoRelato, montarEntregaPagina } from "../src/corpos.js";
import { CHAVE_DO_PONTO, CODIGO_DO_CLIQUE, EMAIL_VALIDO, VISITANTE } from "../src/formatos.js";
import type { EntradaLead, RelatoDaPagina } from "../src/tipos.js";
import { VERSAO_DA_API, VERSAO_DO_PACOTE } from "../src/versao.js";
import { montarCorpoVisita, TETO_DA_VISITA_BYTES } from "../src/visita.js";
import { json, montar, pedidoDaPagina } from "./apoio.js";

// A cópia, byte a byte, de lib/track/api-v1/contrato-v1.json da Dash. Compilado em .test-out/test/.
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const contrato = JSON.parse(readFileSync(join(RAIZ, "contrato", "contrato-v1.json"), "utf8"));

type Exemplo = { nome: string; corpo: Record<string, any>; resposta: { status: number; corpo?: any }; origin?: string | null };
const validos = (rota: string): Exemplo[] => contrato.rotas[rota].exemplos.validos;

test("o contrato é a v1 e as rotas são as que o pacote chama", () => {
  assert.equal(contrato.versao, VERSAO_DA_API);
  assert.equal(contrato.rotas.leads.metodo, "POST");
  assert.equal(contrato.rotas.leads.caminho, "/api/track/v1/leads");
  assert.equal(contrato.rotas.entregaPagina.metodo, "POST");
  assert.equal(contrato.rotas.entregaPagina.caminho, "/api/track/v1/leads/entrega-pagina");
  assert.equal(contrato.rotas.eventos.metodo, "POST");
  assert.equal(contrato.rotas.eventos.caminho, "/api/track/v1/eventos");
});

test("os formatos do pacote são os do contrato", () => {
  assert.equal(CHAVE_DO_PONTO.source, contrato.formatos.ponto);
  assert.equal(CODIGO_DO_CLIQUE.source, contrato.formatos.atk);
  assert.equal(VISITANTE.source, contrato.formatos.abv);
  assert.equal(EMAIL_VALIDO.source, contrato.formatos.email);
  assert.equal(TETO_DA_VISITA_BYTES, contrato.limites.corpoDoEventoBytes);
});

test("o pacote manda os cabeçalhos do contrato nas duas rotas do servidor", async () => {
  const t = montar();
  const r = await t.servidor.capturarLead(pedidoDaPagina(), { ponto: "pc_0123456789ABCDEF", contato: { email: "maria@example.com" } });
  await t.servidor.relatarEntregaDaPagina({
    leadRef: r.leadRef,
    ponto: "pc_0123456789ABCDEF",
    contato: { email: "maria@example.com" },
    resultado: "ok",
    tags: [],
    lista: null,
  });
  await t.rodarAgendadas();
  assert.equal(t.chamadas.length, 2);
  for (const c of t.chamadas) {
    const h = c.init.headers as Record<string, string>;
    assert.equal(h[contrato.cabecalhos.api.nome], contrato.cabecalhos.api.valor);
    assert.match(h[contrato.cabecalhos.pacote.nome], new RegExp(contrato.cabecalhos.pacote.formato));
    assert.match(String(h.Authorization), /^Bearer /);
  }
  assert.match(r.leadRef ?? "", new RegExp(contrato.formatos.idempotencia));
});

test("leads: cada corpo que o pacote monta para os exemplos válidos é igual ao exemplo", () => {
  for (const ex of validos("leads")) {
    const corpo = ex.corpo;
    const { abv, ...outrasMarcas } = corpo.marcas ?? {};
    const entrada: EntradaLead = {
      ponto: corpo.ponto,
      contato: corpo.contato,
      ...(corpo.campos ? { campos: corpo.campos } : {}),
      ...(corpo.marcas ? { marcas: outrasMarcas } : {}),
    };
    // O abv_ chega pelo cookie _abv da página, não pela entrada.
    const cookies = new Map<string, string>(abv ? [["_abv", abv]] : []);
    const montado: Record<string, unknown> = { ...montarCorpoLead(entrada, cookies, corpo.idempotencia) };
    if (corpo.reenvio) {
      montado.reenvio = true;
      const relato: RelatoDaPagina = { leadRef: corpo.idempotencia, ponto: corpo.ponto, contato: {}, ...corpo.entrega_pagina };
      montado.entrega_pagina = montarEntregaPagina(relato);
    }
    assert.deepEqual(montado, corpo, ex.nome);
  }
});

test("leads: as respostas 200 do contrato viram o resultado certo", async () => {
  for (const ex of validos("leads")) {
    const t = montar({ responder: () => json(ex.resposta.status, ex.resposta.corpo) });
    const r = await t.servidor.capturarLead(pedidoDaPagina(), { ponto: ex.corpo.ponto, contato: ex.corpo.contato });
    assert.equal(r.registrado, true, ex.nome);
    assert.equal(r.leadId, ex.resposta.corpo.lead);
    assert.equal(r.entregaPelaPagina, ex.resposta.corpo.entrega === "pagina");
  }
  for (const ex of contrato.rotas.leads.exemplos.invalidos as Exemplo[]) {
    const t = montar({ responder: () => json(ex.resposta.status, { erro: ex.resposta.corpo?.erro }) });
    const r = await t.servidor.capturarLead(pedidoDaPagina(), { ponto: "pc_0123456789ABCDEF", contato: { email: "maria@example.com" } });
    assert.equal(r.entregaPelaPagina, true, `${ex.nome}: fora do 200 a página entrega`);
    assert.equal(r.motivo, "recusado");
  }
});

test("entrega-pagina: cada corpo que o pacote monta para os exemplos válidos é igual ao exemplo", () => {
  for (const ex of validos("entregaPagina")) {
    const corpo = ex.corpo;
    const relato: RelatoDaPagina = {
      leadRef: corpo.lead_ref ?? null,
      ponto: corpo.ponto,
      contato: corpo.contato,
      resultado: corpo.resultado,
      tags: corpo.tags ?? [],
      lista: corpo.lista ?? null,
      ...(corpo.detalhe ? { detalhe: corpo.detalhe } : {}),
    };
    // O pacote sempre manda `tags` e `lista` (o tipo da página exige os dois). O exemplo "erro
    // com detalhe" omite os dois, que o contrato marca como opcionais: a comparação acrescenta os
    // valores vazios que o pacote manda. Pedido à Dash no relatório da FP.
    const esperado = { ...corpo, tags: corpo.tags ?? [], lista: corpo.lista ?? null };
    assert.deepEqual(montarCorpoRelato(relato), esperado, ex.nome);
  }
});

test("eventos: cada corpo que o pacote monta para os exemplos válidos é igual ao exemplo", () => {
  for (const ex of validos("eventos")) {
    const corpo = ex.corpo;
    const query = new URLSearchParams();
    for (const utm of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      if (corpo[utm]) query.set(utm, corpo[utm]);
    }
    if (corpo.atk) query.set("atk", corpo.atk);
    const href = `${ex.origin}${corpo.caminho ?? "/"}${query.size ? `?${query}` : ""}`;
    const montado = montarCorpoVisita(corpo.ponto, {
      href,
      cookie: corpo.abv ? `_abv=${corpo.abv}` : "",
      referrer: corpo.referrer_host ? `https://${corpo.referrer_host}/` : "",
    });
    // `pacote` é a versão de quem manda; `caminho` o pacote sempre manda (o da página). O exemplo
    // "visita mínima" omite o caminho, que o contrato marca como opcional.
    assert.deepEqual(montado, { ...corpo, pacote: VERSAO_DO_PACOTE, caminho: corpo.caminho ?? "/" }, ex.nome);
  }
});
