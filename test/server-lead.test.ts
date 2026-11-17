import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularIdempotencia } from "../src/idempotencia.js";
import type { EntradaLead } from "../src/tipos.js";
import { VERSAO_DO_PACOTE } from "../src/versao.js";
import { AGORA, BASE, PONTO, SEGREDO, json, montar, pedidoDaPagina, tempoEsgotado } from "./apoio.js";

const ENTRADA: EntradaLead = {
  ponto: PONTO,
  contato: { nome: "Maria Exemplo", email: "maria@example.com", telefone: "+55 (11) 90000-0000" },
  campos: { objetivo: "emagrecer" },
  marcas: { utm_source: "instagram", utm_medium: "stories", pagina: "/black?utm_source=instagram" },
};

const CHAVE = calcularIdempotencia(PONTO, ENTRADA.contato, AGORA);

test("sem envs: sem_configuracao, nenhum fetch, leadRef nulo e um aviso só por processo", async () => {
  for (const env of [{}, { url: BASE }, { segredo: SEGREDO }, { url: " ", segredo: SEGREDO }]) {
    const t = montar({ env });
    const r1 = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
    const r2 = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
    for (const r of [r1, r2]) {
      assert.deepEqual(r, {
        registrado: false,
        leadId: null,
        leadRef: null,
        entregaPelaPagina: true,
        motivo: "sem_configuracao",
      });
    }
    assert.equal(t.chamadas.length, 0);
    assert.equal(t.agendadas.length, 0, "sem reenvio");
    assert.equal(t.avisos.length, 1);
    assert.doesNotMatch(t.avisos[0], /example\.com|90000/);
  }
});

test("200 com entrega track: entregaPelaPagina false, motivo track_entrega", async () => {
  const t = montar({ responder: () => json(200, { lead: "0b5f…uuid", novo: true, entrega: "track" }) });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  assert.deepEqual(r, {
    registrado: true,
    leadId: "0b5f…uuid",
    leadRef: CHAVE,
    entregaPelaPagina: false,
    motivo: "track_entrega",
  });
  assert.equal(t.agendadas.length, 0, "200 não agenda reenvio");
});

test("200 com entrega pagina: entregaPelaPagina true, motivo modo_pagina", async () => {
  const t = montar({ responder: () => json(200, { lead: "lead-9", novo: false, entrega: "pagina" }) });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  assert.equal(r.registrado, true);
  assert.equal(r.entregaPelaPagina, true);
  assert.equal(r.motivo, "modo_pagina");
  assert.equal(r.leadId, "lead-9");
  assert.equal(t.agendadas.length, 0);
});

test("o POST leva o segredo, os dois cabeçalhos da API e o corpo de 01 §6.1", async () => {
  const t = montar();
  await t.servidor.capturarLead(
    pedidoDaPagina("_atk=clk_8F2KQ7XA3M9TB1RC; _abv=abv_k2m9x7q4p1z8w3n5; outro=x"),
    ENTRADA,
  );
  assert.equal(t.chamadas.length, 1);
  const [c] = t.chamadas;
  assert.equal(c.url, `${BASE}/api/track/v1/leads`);
  assert.equal(c.init.method, "POST");
  const h = c.init.headers as Record<string, string>;
  assert.equal(h.Authorization, `Bearer ${SEGREDO}`);
  assert.equal(h["Content-Type"], "application/json");
  assert.equal(h["X-Amber-Track-Api"], "1");
  assert.equal(h["X-Amber-Track-Pacote"], VERSAO_DO_PACOTE);
  assert.ok(c.init.signal instanceof AbortSignal, "a chamada tem limite");
  assert.deepEqual(c.corpo, {
    ponto: PONTO,
    idempotencia: CHAVE,
    contato: { nome: "Maria Exemplo", email: "maria@example.com", telefone: "+55 (11) 90000-0000" },
    campos: { objetivo: "emagrecer" },
    marcas: {
      utm_source: "instagram",
      utm_medium: "stories",
      pagina: "/black",
      atk: "clk_8F2KQ7XA3M9TB1RC",
      abv: "abv_k2m9x7q4p1z8w3n5",
    },
  });
  assert.ok(!("tag" in c.corpo) && !("tags" in c.corpo) && !("lista" in c.corpo), "o lead nunca leva tag nem lista");
});

test("marcas.atk vence o cookie _atk; _abv fora do formato não vai", async () => {
  const t = montar();
  await t.servidor.capturarLead(pedidoDaPagina("_atk=clk_0000000000000000; _abv=abv_CURTO"), {
    ...ENTRADA,
    marcas: { atk: "clk_8F2KQ7XA3M9TB1RC" },
  });
  assert.deepEqual(t.chamadas[0].corpo.marcas, { atk: "clk_8F2KQ7XA3M9TB1RC" });
});

test("todo desfecho com envs devolve leadRef igual à idempotencia enviada", async () => {
  const desfechos = [
    () => json(200, { lead: "a", novo: true, entrega: "track" }),
    () => json(200, { lead: "b", novo: true, entrega: "pagina" }),
    () => json(500, { erro: "BANCO_INDISPONIVEL" }),
    () => json(422, { erro: "SEM_CONTATO" }),
    () => json(200, { inesperado: true }),
    tempoEsgotado,
    () => {
      throw new TypeError("fetch failed");
    },
  ];
  for (const responder of desfechos) {
    const t = montar({ responder });
    const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
    assert.equal(r.leadRef, t.chamadas[0].corpo.idempotencia);
    assert.match(r.leadRef ?? "", /^[0-9a-f]{64}$/);
  }
});

test("tempo esgotado em 2 s: entregaPelaPagina true e reenvio agendado com a mesma idempotencia e reenvio: true", async () => {
  // Fetch que só termina quando o sinal aborta: prova o corte de verdade, com o relógio real.
  const t = montar({
    responder: ({ init }) =>
      new Promise<Response>((_, rejeitar) => {
        init.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
      }),
  });
  // O timer do AbortSignal.timeout não segura o processo (unref); num servidor o laço está vivo.
  const vivo = setTimeout(() => undefined, 5_000);
  const inicio = Date.now();
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  const decorrido = Date.now() - inicio;
  clearTimeout(vivo);
  assert.ok(decorrido >= 1_900 && decorrido < 3_000, `esperou ${decorrido} ms`);
  assert.deepEqual(r, {
    registrado: false,
    leadId: null,
    leadRef: CHAVE,
    entregaPelaPagina: true,
    motivo: "tempo_esgotado",
  });
  assert.equal(t.agendadas.length, 1, "reenvio agendado no after()");

  t.trocarResposta(() => json(200, { lead: "lead-1", novo: true, entrega: "pagina" }));
  await t.rodarAgendadas();
  assert.deepEqual(t.esperas, [10_000], "o reenvio sai 10 s depois");
  assert.equal(t.chamadas.length, 2);
  const [primeiro, reenvio] = t.chamadas;
  assert.equal(reenvio.url, `${BASE}/api/track/v1/leads`);
  assert.equal(reenvio.corpo.idempotencia, primeiro.corpo.idempotencia);
  assert.equal(reenvio.corpo.reenvio, true);
  assert.deepEqual({ ...reenvio.corpo, reenvio: undefined }, { ...primeiro.corpo, reenvio: undefined });
  assert.equal(t.servidor.reenviosPendentes(), 0);
});

test("o reenvio sai mesmo depois do relato: nunca é cancelado", async () => {
  const t = montar({ responder: tempoEsgotado });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  await t.servidor.relatarEntregaDaPagina({
    leadRef: r.leadRef,
    ponto: PONTO,
    contato: { email: "maria@example.com" },
    resultado: "ok",
    tags: ["[Exemplo] Lead"],
    lista: 70,
  });
  t.trocarResposta(() => json(200, { lead: "lead-1", novo: true, entrega: "pagina" }));
  await t.rodarAgendadas();
  const reenvios = t.chamadas.filter((c) => c.corpo.reenvio === true);
  assert.equal(reenvios.length, 1, "o reenvio saiu");
  assert.equal(reenvios[0].corpo.idempotencia, r.leadRef);
});

test("500: entregaPelaPagina true, motivo recusado, e o reenvio tenta até 3 vezes com 5 s entre elas", async () => {
  const t = montar({ responder: () => json(500, { erro: "BANCO_INDISPONIVEL" }) });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  assert.equal(r.entregaPelaPagina, true);
  assert.equal(r.registrado, false);
  assert.equal(r.motivo, "recusado");
  await t.rodarAgendadas();
  assert.deepEqual(t.esperas, [10_000, 5_000, 5_000]);
  assert.equal(t.chamadas.length, 4, "o envio e três tentativas");
  assert.ok(t.chamadas.slice(1).every((c) => c.corpo.reenvio === true && c.corpo.idempotencia === r.leadRef));
});

test("recusa definitiva (4xx) no reenvio para na primeira tentativa", async () => {
  const t = montar({ responder: () => json(422, { erro: "SEM_CONTATO" }) });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  assert.equal(r.motivo, "recusado");
  await t.rodarAgendadas();
  assert.equal(t.chamadas.length, 2);
});

test("nunca lança erro para a rota, nem com entrada estranha", async () => {
  const t = montar({
    responder: () => {
      throw new Error("explodiu");
    },
  });
  const r = await t.servidor.capturarLead(pedidoDaPagina(), { ponto: PONTO } as unknown as EntradaLead);
  assert.equal(r.entregaPelaPagina, true);
  await t.rodarAgendadas();
});

test("4xx da API: um aviso por código e por processo, sem dado pessoal, e a página segue entregando", async () => {
  const t = montar({ responder: () => json(422, { erro: "CORPO_INVALIDO" }) });
  const r1 = await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  const r2 = await t.servidor.capturarLead(pedidoDaPagina(), { ...ENTRADA, contato: { email: "outra@example.com" } });
  for (const r of [r1, r2]) {
    assert.equal(r.entregaPelaPagina, true);
    assert.equal(r.motivo, "recusado");
  }
  assert.equal(t.avisos.length, 1);
  assert.match(t.avisos[0], /422/);
  assert.match(t.avisos[0], /CORPO_INVALIDO/);
  assert.doesNotMatch(t.avisos[0], /example\.com|90000|Maria|emagrecer/);
  t.trocarResposta(() => json(403, { erro: "ORIGEM_NAO_PERMITIDA" }));
  await t.servidor.capturarLead(pedidoDaPagina(), { ...ENTRADA, contato: { email: "x@example.com" } });
  assert.equal(t.avisos.length, 2, "código novo, aviso novo");
});

test("5xx não gera aviso de 4xx", async () => {
  const t = montar({ responder: () => json(500, { erro: "ERRO_INTERNO" }) });
  await t.servidor.capturarLead(pedidoDaPagina(), ENTRADA);
  assert.equal(t.avisos.length, 0);
});
