import { test } from "node:test";
import assert from "node:assert/strict";

import { criarRegistroDeVisitas, montarCorpoVisita, TETO_DA_VISITA_BYTES, type AmbienteDoNavegador } from "../src/visita.js";
import { VERSAO_DO_PACOTE } from "../src/versao.js";
import { PONTO } from "./apoio.js";

const ENDERECO = "http://localhost:3000";

function ambiente(extra: Partial<AmbienteDoNavegador> = {}) {
  const beacons: Array<{ url: string; dados: Blob }> = [];
  const fetches: Array<{ url: string; init: RequestInit }> = [];
  const amb: AmbienteDoNavegador = {
    href: "https://lp.example.com/black?utm_source=instagram&utm_medium=stories&utm_campaign=black-november-2026&atk=clk_8F2KQ7XA3M9TB1RC",
    cookie: "_abv=abv_k2m9x7q4p1z8w3n5; outro=1",
    referrer: "https://l.instagram.com/?u=x",
    sendBeacon: (url, dados) => {
      beacons.push({ url, dados });
      return true;
    },
    fetch: (async (url: string, init: RequestInit) => {
      fetches.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch,
    ...extra,
  };
  return { amb, beacons, fetches };
}

const bytes = (texto: string) => new TextEncoder().encode(texto).length;

test("corpo da visita: ponto, caminho, UTMs da URL, atk da query, abv do cookie, referrer_host", () => {
  const { amb } = ambiente();
  assert.deepEqual(montarCorpoVisita(PONTO, amb), {
    v: 1,
    pacote: VERSAO_DO_PACOTE,
    ponto: PONTO,
    tipo: "visita",
    caminho: "/black",
    atk: "clk_8F2KQ7XA3M9TB1RC",
    abv: "abv_k2m9x7q4p1z8w3n5",
    utm_source: "instagram",
    utm_medium: "stories",
    utm_campaign: "black-november-2026",
    referrer_host: "l.instagram.com",
  });
});

test("sem atk na query, usa o cookie _atk; atk inválido não vai", () => {
  const comCookie = montarCorpoVisita(PONTO, {
    href: "https://lp.example.com/",
    cookie: "_atk=clk_0000000000000000",
    referrer: "",
  });
  assert.equal(comCookie.atk, "clk_0000000000000000");
  assert.ok(!("referrer_host" in comCookie));
  assert.ok(!("abv" in comCookie));

  const invalido = montarCorpoVisita(PONTO, { href: "https://lp.example.com/?atk=nada", cookie: "_atk=clk_x", referrer: "" });
  assert.ok(!("atk" in invalido));
});

test("corpo da visita até 4 KB, mesmo com UTM enorme e caractere que o JSON escapa", () => {
  const enorme = encodeURIComponent("\u0001".repeat(1_000) + "ç".repeat(2_000));
  const href = `https://lp.example.com/${"a".repeat(500)}?utm_source=${enorme}&utm_medium=${enorme}&utm_campaign=${enorme}&utm_content=${enorme}&utm_term=${enorme}`;
  const corpo = montarCorpoVisita(PONTO, { href, cookie: "", referrer: `https://${"r".repeat(300)}.example.com/` });
  const texto = JSON.stringify(corpo);
  assert.ok(bytes(texto) <= TETO_DA_VISITA_BYTES, `${bytes(texto)} bytes`);
  assert.ok(corpo.caminho.length <= 200);
  assert.equal(corpo.ponto, PONTO);
});

test("duas montagens no mesmo carregamento mandam uma visita", () => {
  const registrar = criarRegistroDeVisitas();
  const { amb, beacons } = ambiente();
  assert.equal(registrar(PONTO, amb, ENDERECO), true);
  assert.equal(registrar(PONTO, amb, ENDERECO), false);
  assert.equal(beacons.length, 1);
  // outro ponto na mesma página é outra visita
  registrar("pc_0000000000000000", amb, ENDERECO);
  assert.equal(beacons.length, 2);
});

test("sendBeacon com Blob text/plain para /api/track/v1/eventos", async () => {
  const registrar = criarRegistroDeVisitas();
  const { amb, beacons, fetches } = ambiente();
  registrar(PONTO, amb, `${ENDERECO}/`);
  assert.equal(fetches.length, 0);
  assert.equal(beacons[0].url, `${ENDERECO}/api/track/v1/eventos`);
  assert.equal(beacons[0].dados.type, "text/plain");
  const corpo = JSON.parse(await beacons[0].dados.text());
  assert.equal(corpo.tipo, "visita");
});

test("sem sendBeacon usa fetch com keepalive e credentials omit", () => {
  const registrar = criarRegistroDeVisitas();
  const { amb, fetches } = ambiente({ sendBeacon: undefined });
  registrar(PONTO, amb, ENDERECO);
  assert.equal(fetches.length, 1);
  const { url, init } = fetches[0];
  assert.equal(url, `${ENDERECO}/api/track/v1/eventos`);
  assert.equal(init.method, "POST");
  assert.equal(init.keepalive, true);
  assert.equal(init.credentials, "omit");
  assert.deepEqual(init.headers, { "Content-Type": "text/plain" });
  assert.equal(JSON.parse(String(init.body)).ponto, PONTO);
});

test("erro no envio nunca sobe", () => {
  const registrar = criarRegistroDeVisitas();
  const { amb } = ambiente({
    sendBeacon: () => {
      throw new Error("bloqueado");
    },
    fetch: (() => Promise.reject(new Error("rede"))) as unknown as typeof fetch,
  });
  assert.doesNotThrow(() => registrar(PONTO, amb, ENDERECO));
  assert.doesNotThrow(() => registrar(PONTO, { ...amb, href: "não é url" }, ENDERECO));
});
