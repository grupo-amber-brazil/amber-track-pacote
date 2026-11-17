import { test } from "node:test";
import assert from "node:assert/strict";

import { montarCorpoLead, montarCorpoRelato } from "../src/corpos.js";
import { PONTO } from "./apoio.js";

const SEM_COOKIES = new Map<string, string>();
const CHAVE = "a".repeat(64);
const lead = (entrada: Record<string, unknown>) =>
  montarCorpoLead({ ponto: PONTO, ...entrada } as never, SEM_COOKIES, CHAVE);

test("telefone fora de 10 a 15 dígitos sai quando o e-mail é válido", () => {
  for (const telefone of ["9 8765-4321", "+55 11 90000 0000 123"]) {
    const c = lead({ contato: { email: "maria@example.com", telefone } });
    assert.deepEqual(c.contato, { email: "maria@example.com" });
  }
});

test("e-mail malformado sai quando o telefone é válido", () => {
  const c = lead({ contato: { email: "maria@", telefone: "+55 (11) 90000-0000" } });
  assert.deepEqual(c.contato, { telefone: "+55 (11) 90000-0000" });
});

test("contato válido passa intacto; sem nenhum válido, segue como veio", () => {
  const ok = lead({ contato: { nome: "Maria", email: "maria@example.com", telefone: "11900000000" } });
  assert.deepEqual(ok.contato, { nome: "Maria", email: "maria@example.com", telefone: "11900000000" });
  const ruim = lead({ contato: { email: "maria@", telefone: "123" } });
  assert.deepEqual(ruim.contato, { email: "maria@", telefone: "123" });
});

test("nome corta em 120 e e-mail com mais de 254 não conta como válido", () => {
  const c = lead({ contato: { nome: "n".repeat(300), telefone: "11900000000" } });
  assert.equal(c.contato.nome?.length, 120);
  const longo = `${"a".repeat(250)}@example.com`;
  const d = lead({ contato: { email: longo, telefone: "11900000000" } });
  assert.equal(d.contato.email, undefined);
  assert.equal(d.contato.telefone, "11900000000");
});

test("campos: chave fora do formato sai, máximo de 30, valor com mais de 500 descarta a chave", () => {
  const muitos: Record<string, string> = {};
  for (let i = 0; i < 40; i++) muitos[`c${String(i).padStart(2, "0")}`] = "x";
  const c = lead({
    contato: { email: "maria@example.com" },
    campos: { Objetivo: "a", "data-nasc": "b", ok_1: "v", longo: "y".repeat(501), limite: "z".repeat(500) },
  });
  assert.deepEqual(c.campos, { ok_1: "v", limite: "z".repeat(500) });
  const m = lead({ contato: { email: "maria@example.com" }, campos: muitos });
  assert.equal(Object.keys(m.campos ?? {}).length, 30);
  const nada = lead({ contato: { email: "maria@example.com" }, campos: { Ruim: "a" } });
  assert.equal(nada.campos, undefined);
});

test("relato: tags vazias, repetidas além de 20 e acima de 255 são saneadas; lista precisa ser inteiro positivo", () => {
  const tags = ["", "  ", "t".repeat(300), ...Array.from({ length: 30 }, (_, i) => `tag${i}`)];
  const c = montarCorpoRelato({ ponto: PONTO, resultado: "ok", tags, lista: 0 } as never);
  assert.equal(c.tags.length, 20);
  assert.equal(c.tags[0].length, 255);
  assert.ok(c.tags.every((t) => t.length > 0));
  assert.equal(c.lista, null);
  assert.equal(montarCorpoRelato({ ponto: PONTO, resultado: "ok", tags: [], lista: -3 } as never).lista, null);
  assert.equal(montarCorpoRelato({ ponto: PONTO, resultado: "ok", tags: [], lista: 7 } as never).lista, 7);
});
