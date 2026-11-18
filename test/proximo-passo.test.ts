import { test } from "node:test";
import assert from "node:assert/strict";

import { linkDoProximoPassoCom } from "../src/proximo-passo.js";

const CLK = "clk_8F2KQ7XA3M9TB1RC";

test("acrescenta atk a uma URL https", () => {
  assert.equal(linkDoProximoPassoCom("https://exemplo.com/p/oferta", CLK), "https://exemplo.com/p/oferta?atk=clk_8F2KQ7XA3M9TB1RC");
});

test("mantém a query que já existe e acrescenta no fim", () => {
  assert.equal(
    linkDoProximoPassoCom("https://exemplo.com/p/oferta?utm_source=ig&utm_content=bio", CLK),
    "https://exemplo.com/p/oferta?utm_source=ig&utm_content=bio&atk=clk_8F2KQ7XA3M9TB1RC",
  );
});

test("o fragmento continua depois da query", () => {
  assert.equal(linkDoProximoPassoCom("https://exemplo.com/p#topo", CLK), "https://exemplo.com/p?atk=clk_8F2KQ7XA3M9TB1RC#topo");
});

test("a URL sai normalizada pelo URL", () => {
  assert.equal(linkDoProximoPassoCom("https://exemplo.com", CLK), "https://exemplo.com/?atk=clk_8F2KQ7XA3M9TB1RC");
});

test("sem clique, a URL volta como veio", () => {
  assert.equal(linkDoProximoPassoCom("https://exemplo.com/p", undefined), "https://exemplo.com/p");
});

test("clique fora do formato é ausência", () => {
  assert.equal(linkDoProximoPassoCom("https://exemplo.com/p", "clk_123"), "https://exemplo.com/p");
  assert.equal(linkDoProximoPassoCom("https://exemplo.com/p", "abv_8F2KQ7XA3M9TB1RC"), "https://exemplo.com/p");
});

test("só https", () => {
  assert.equal(linkDoProximoPassoCom("http://exemplo.com/p", CLK), "http://exemplo.com/p");
  assert.equal(linkDoProximoPassoCom("whatsapp://send?phone=5511999999999", CLK), "whatsapp://send?phone=5511999999999");
});

test("URL que já traz atk volta sem mudança, mesmo com outro valor", () => {
  const url = "https://exemplo.com/p?atk=clk_0000000000000000";
  assert.equal(linkDoProximoPassoCom(url, CLK), url);
});

test("URL inválida ou relativa volta como veio, sem lançar", () => {
  for (const url of ["não é url", "/proximo", ""]) {
    assert.doesNotThrow(() => linkDoProximoPassoCom(url, CLK));
    assert.equal(linkDoProximoPassoCom(url, CLK), url);
  }
});
