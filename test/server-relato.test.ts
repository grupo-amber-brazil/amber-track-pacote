import { test } from "node:test";
import assert from "node:assert/strict";

import type { EntradaLead, RelatoDaPagina } from "../src/tipos.js";
import { BASE, PONTO, SEGREDO, json, montar, pedidoDaPagina, tempoEsgotado } from "./apoio.js";

const ENTRADA: EntradaLead = { ponto: PONTO, contato: { nome: "Maria Exemplo", email: "maria@example.com" } };

const relato = (leadRef: string | null, extra: Partial<RelatoDaPagina> = {}): RelatoDaPagina => ({
  leadRef,
  ponto: PONTO,
  contato: { email: "maria@example.com" },
  resultado: "ok",
  tags: ["[Exemplo] Lead Black", "#204"],
  lista: 70,
  ...extra,
});

const rotaDoRelato = `${BASE}/api/track/v1/leads/entrega-pagina`;

test("relato depois de 200 vai para entrega-pagina com lead_ref e contato, depois da resposta", async () => {
  const t = montar();
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  await t.servidor.relatarEntregaDaPagina(relato(r.leadRef, { detalhe: "AC 200" }));
  assert.equal(t.chamadas.length, 1, "o relato não sai antes do after()");
  await t.rodarAgendadas();
  assert.equal(t.chamadas.length, 2);
  const c = t.chamadas[1];
  assert.equal(c.url, rotaDoRelato);
  const h = c.init.headers as Record<string, string>;
  assert.equal(h.Authorization, `Bearer ${SEGREDO}`);
  assert.equal(h["X-Amber-Track-Api"], "1");
  assert.deepEqual(c.corpo, {
    ponto: PONTO,
    lead_ref: r.leadRef,
    contato: { email: "maria@example.com" },
    resultado: "ok",
    tags: ["[Exemplo] Lead Black", "#204"],
    lista: 70,
    detalhe: "AC 200",
  });
});

test("relato depois de tempo esgotado, no mesmo processo, vai junto com o reenvio em entrega_pagina, sem chamada separada", async () => {
  const t = montar({ responder: tempoEsgotado });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  await t.servidor.relatarEntregaDaPagina(relato(r.leadRef, { resultado: "pendente", lista: null, tags: [] }));
  t.trocarResposta(() => json(200, { lead: "lead-1", novo: true, entrega: "pagina" }));
  await t.rodarAgendadas();
  assert.equal(t.chamadas.filter((c) => c.url === rotaDoRelato).length, 0, "sem chamada separada");
  const reenvio = t.chamadas.find((c) => c.corpo.reenvio === true);
  assert.ok(reenvio);
  assert.deepEqual(reenvio.corpo.entrega_pagina, { resultado: "pendente", tags: [], lista: null });
});

test("relato que chega depois de o reenvio já ter saído sem ele vai pela rota própria", async () => {
  const t = montar({ responder: tempoEsgotado });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  t.trocarResposta(async (c) => {
    if (c.corpo.reenvio === true) {
      // o relato chega enquanto o reenvio está no ar
      await t.servidor.relatarEntregaDaPagina(relato(r.leadRef));
      return json(200, { lead: "lead-1", novo: true, entrega: "pagina" });
    }
    return json(200, {});
  });
  await t.rodarAgendadas();
  const relatos = t.chamadas.filter((c) => c.url === rotaDoRelato);
  assert.equal(relatos.length, 1);
  assert.equal(relatos[0].corpo.lead_ref, r.leadRef);
});

test("relato sem leadRef manda só o contato", async () => {
  const t = montar();
  await t.servidor.relatarEntregaDaPagina(relato(null, { contato: { telefone: "11900000000" } }));
  await t.rodarAgendadas();
  assert.equal(t.chamadas.length, 1);
  assert.equal(t.chamadas[0].url, rotaDoRelato);
  assert.ok(!("lead_ref" in t.chamadas[0].corpo));
  assert.deepEqual(t.chamadas[0].corpo.contato, { telefone: "11900000000" });
});

test("404 → uma nova tentativa 30 s depois; de novo 404 → desiste com aviso sem dado pessoal, sem exceção", async () => {
  const t = montar({ responder: () => json(404, { erro: "LEAD_INEXISTENTE" }) });
  await assert.doesNotReject(t.servidor.relatarEntregaDaPagina(relato(null)));
  await assert.doesNotReject(t.rodarAgendadas());
  assert.equal(t.chamadas.length, 2);
  assert.deepEqual(t.esperas, [30_000]);
  assert.equal(t.avisos.length, 1);
  assert.doesNotMatch(t.avisos[0], /maria|example\.com/i);
});

test("404 e depois 200: para na segunda tentativa, sem aviso", async () => {
  let n = 0;
  const t = montar({ responder: () => (++n === 1 ? json(404, { erro: "LEAD_INEXISTENTE" }) : json(200, { ok: true })) });
  await t.servidor.relatarEntregaDaPagina(relato(null));
  await t.rodarAgendadas();
  assert.equal(t.chamadas.length, 2);
  assert.equal(t.avisos.length, 0);
});

test("detalhe passa de 200 → vai cortado em 200; relato sem configuração não chama nada", async () => {
  const t = montar();
  await t.servidor.relatarEntregaDaPagina(relato(null, { detalhe: "x".repeat(250) }));
  await t.rodarAgendadas();
  assert.equal(String(t.chamadas[0].corpo.detalhe).length, 200);

  const sem = montar({ env: {} });
  await sem.servidor.relatarEntregaDaPagina(relato(null));
  await sem.rodarAgendadas();
  assert.equal(sem.chamadas.length, 0);
});
