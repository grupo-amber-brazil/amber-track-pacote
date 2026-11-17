import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { calcularIdempotencia, JANELA_MS } from "../src/idempotencia.js";
import { AGORA, PONTO, montar, pedidoDaPagina } from "./apoio.js";

const inicioDaJanela = Math.floor(AGORA / JANELA_MS) * JANELA_MS;

test("a chave é sha256(ponto | email_norm | dígitos do telefone | janela de 2 minutos), em hexadecimal", () => {
  const chave = calcularIdempotencia(PONTO, { email: "maria@example.com", telefone: "(11) 90000-0000" }, AGORA);
  const esperado = createHash("sha256")
    .update(`${PONTO}|maria@example.com|11900000000|${Math.floor(AGORA / 120_000)}`)
    .digest("hex");
  assert.equal(chave, esperado);
  assert.match(chave, /^[0-9a-f]{64}$/);
});

test("mesma entrada na mesma janela de 2 min → mesma chave", () => {
  const contato = { email: "maria@example.com", telefone: "11900000000" };
  const a = calcularIdempotencia(PONTO, contato, inicioDaJanela);
  const b = calcularIdempotencia(PONTO, contato, inicioDaJanela + JANELA_MS - 1);
  assert.equal(a, b);
  const c = calcularIdempotencia(PONTO, contato, inicioDaJanela + JANELA_MS);
  assert.notEqual(a, c, "a janela seguinte é outra chave");
});

test("e-mail com maiúscula e espaço → mesma chave; telefone formatado → mesma chave", () => {
  const base = calcularIdempotencia(PONTO, { email: "maria@example.com", telefone: "11900000000" }, AGORA);
  assert.equal(calcularIdempotencia(PONTO, { email: "  Maria@Example.COM ", telefone: "11900000000" }, AGORA), base);
  assert.equal(calcularIdempotencia(PONTO, { email: "maria@example.com", telefone: "(11) 90000-0000" }, AGORA), base);
  assert.notEqual(calcularIdempotencia(PONTO, { email: "outra@example.com", telefone: "11900000000" }, AGORA), base);
  assert.notEqual(calcularIdempotencia("pc_0000000000000000", { email: "maria@example.com", telefone: "11900000000" }, AGORA), base);
});

test("dois envios da mesma pessoa na mesma janela mandam a mesma chave à API", async () => {
  let agora = inicioDaJanela + 1_000;
  const t = montar({ agora: () => agora });
  await t.servidor.capturarLead(pedidoDaPagina(), { ponto: PONTO, contato: { email: "maria@example.com" } });
  agora = inicioDaJanela + 100_000;
  await t.servidor.capturarLead(pedidoDaPagina(), { ponto: PONTO, contato: { email: " MARIA@example.com" } });
  assert.equal(t.chamadas[0].corpo.idempotencia, t.chamadas[1].corpo.idempotencia);
});
