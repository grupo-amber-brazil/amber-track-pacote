import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server.js";

import { comAmberTrack, VALIDADE_DO_COOKIE_S } from "../src/proxy.js";

const CLIQUE = "clk_8F2KQ7XA3M9TB1RC";
const OUTRO_CLIQUE = "clk_0000000000000000";

function pedido(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, { headers: cookie ? { cookie } : {} });
}

const setCookies = (r: NextResponse): string[] => r.headers.getSetCookie();

test("atk válido grava _atk com Path=/, 30 dias, Secure, SameSite=Lax, sem HttpOnly e sem Domain", () => {
  const r = comAmberTrack(pedido(`https://lp.example.com/oferta?atk=${CLIQUE}`), NextResponse.next());
  const linhas = setCookies(r);
  assert.equal(linhas.length, 1);
  const linha = linhas[0];
  assert.match(linha, new RegExp(`^_atk=${CLIQUE};`));
  assert.match(linha, /Path=\//);
  assert.match(linha, new RegExp(`Max-Age=${VALIDADE_DO_COOKIE_S}`));
  assert.equal(VALIDADE_DO_COOKIE_S, 2_592_000);
  assert.match(linha, /Secure/);
  assert.match(linha, /SameSite=lax/i);
  assert.doesNotMatch(linha, /HttpOnly/i);
  assert.doesNotMatch(linha, /Domain=/i);
});

test("atk inválido não grava nada", () => {
  for (const atk of ["clk_123", "clk_8f2kq7xa3m9tb1rc", "abc", "clk_8F2KQ7XA3M9TB1RCX", "clk_IIIIIIIIIIIIIIII", ""]) {
    const r = comAmberTrack(pedido(`https://lp.example.com/?atk=${encodeURIComponent(atk)}`), NextResponse.next());
    assert.deepEqual(setCookies(r), [], `atk=${atk}`);
  }
  const semAtk = comAmberTrack(pedido("https://lp.example.com/"), NextResponse.next());
  assert.deepEqual(setCookies(semAtk), []);
});

test("mesmo valor já gravado não manda Set-Cookie", () => {
  const r = comAmberTrack(pedido(`https://lp.example.com/?atk=${CLIQUE}`, `_atk=${CLIQUE}`), NextResponse.next());
  assert.deepEqual(setCookies(r), []);
});

test("valor diferente sobrescreve: o clique mais novo vence", () => {
  const r = comAmberTrack(pedido(`https://lp.example.com/?atk=${CLIQUE}`, `_atk=${OUTRO_CLIQUE}`), NextResponse.next());
  const linhas = setCookies(r);
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], new RegExp(`^_atk=${CLIQUE};`));
});

test("nenhum outro cookie muda e a resposta da página segue intacta", () => {
  const resposta = NextResponse.next();
  resposta.cookies.set("_abv", "abv_k2m9x7q4p1z8w3n5", { path: "/" });
  resposta.headers.set("x-da-pagina", "1");
  const r = comAmberTrack(
    pedido(`https://lp.example.com/?atk=${CLIQUE}&utm_source=instagram`, "_abv=abv_k2m9x7q4p1z8w3n5; outro=1"),
    resposta,
  );
  assert.equal(r, resposta, "devolve a mesma resposta, sem redirecionar");
  const linhas = setCookies(r);
  assert.equal(linhas.length, 2);
  assert.ok(linhas.some((l) => l.startsWith("_abv=abv_k2m9x7q4p1z8w3n5;")), "o _abv da página fica como estava");
  assert.ok(linhas.some((l) => l.startsWith(`_atk=${CLIQUE};`)));
  assert.ok(!linhas.some((l) => l.startsWith("outro=")));
  assert.equal(r.headers.get("x-da-pagina"), "1");
  assert.equal(r.headers.get("location"), null);
});
