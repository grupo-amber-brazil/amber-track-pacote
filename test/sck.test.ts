import { test } from "node:test";
import assert from "node:assert/strict";

import { montarSckCom, TETO_DO_SCK } from "../src/sck.js";

const ABV = "abv_k2m9x7q4p1z8w3n5";
const CLK = "clk_8F2KQ7XA3M9TB1RC";
const UTMS = {
  utm_source: "instagram",
  utm_medium: "stories",
  utm_campaign: "black-november-2026",
  utm_content: "story-01",
  utm_term: "",
};

test("Hotmart: exemplo da spec, com abv e com _atk", () => {
  assert.equal(
    montarSckCom("hotmart", UTMS, ABV, CLK),
    "instagram|stories|black-november-2026|story-01||abv_k2m9x7q4p1z8w3n5|clk_8F2KQ7XA3M9TB1RC",
  );
});

test("Hotmart sem abv: o sexto campo fica vazio", () => {
  assert.equal(montarSckCom("hotmart", UTMS, null, CLK), "instagram|stories|black-november-2026|story-01|||clk_8F2KQ7XA3M9TB1RC");
});

test("Hotmart sem _atk: o sétimo campo some", () => {
  assert.equal(montarSckCom("hotmart", UTMS, ABV, undefined), "instagram|stories|black-november-2026|story-01||abv_k2m9x7q4p1z8w3n5");
  assert.equal(montarSckCom("hotmart", UTMS, null, null), "instagram|stories|black-november-2026|story-01||");
});

test("Hotmart: | e espaço saem dos valores; abv e clk fora do formato contam como ausentes", () => {
  assert.equal(
    montarSckCom("hotmart", { utm_source: "insta gram", utm_medium: "a|b", utm_campaign: " c\td " }, "abv_XX", "clk_123"),
    "instagram|ab|cd|||",
  );
});

test("300 caracteres de UTM encurtam na ordem certa e mantêm abv_ e clk_", () => {
  const utms = {
    utm_source: "s".repeat(60),
    utm_medium: "m".repeat(60),
    utm_campaign: "c".repeat(60),
    utm_content: "o".repeat(60),
    utm_term: "t".repeat(60),
  };
  const sck = montarSckCom("hotmart", utms, ABV, CLK);
  assert.equal(sck.length, TETO_DO_SCK);
  const campos = sck.split("|");
  assert.equal(campos.length, 7);
  assert.equal(campos[5], ABV);
  assert.equal(campos[6], CLK);
  // 300 + 6 separadores + 20 + 20 = 346; sobra 91 para cortar: utm_term (60) some e utm_content perde 31
  assert.deepEqual(
    campos.slice(0, 5).map((c) => c.length),
    [60, 60, 60, 29, 0],
  );
  assert.equal(campos[0], utms.utm_source, "utm_source fica inteiro enquanto os de trás bastam");
});

test("UTM gigante corta até o utm_source, e abv_ e clk_ sempre cabem", () => {
  const utms = { utm_source: "s".repeat(400), utm_medium: "m".repeat(400), utm_campaign: "c", utm_content: "o", utm_term: "t" };
  const sck = montarSckCom("hotmart", utms, ABV, CLK);
  assert.ok(sck.length <= TETO_DO_SCK);
  const campos = sck.split("|");
  assert.deepEqual(campos.slice(1, 7), ["", "", "", "", ABV, CLK]);
  assert.equal(campos[0].length, TETO_DO_SCK - (6 + 20 + 20));
});

test("abaixo do teto nada é cortado", () => {
  const utms = { utm_source: "s".repeat(40), utm_medium: "m".repeat(40), utm_campaign: "c".repeat(40), utm_content: "o".repeat(40), utm_term: "t".repeat(40) };
  assert.equal(montarSckCom("hotmart", utms, ABV, CLK).length, 200 + 6 + 40);
});

test("Guru: abv_|clk_, ou só um dos dois, e nunca UTM", () => {
  assert.equal(montarSckCom("guru", UTMS, ABV, CLK), `${ABV}|${CLK}`);
  assert.equal(montarSckCom("guru", UTMS, ABV, null), ABV);
  assert.equal(montarSckCom("guru", UTMS, null, CLK), CLK);
  assert.equal(montarSckCom("guru", UTMS, null, null), "");
  for (const sck of [montarSckCom("guru", UTMS, ABV, CLK), montarSckCom("guru", UTMS, null, CLK)]) {
    assert.doesNotMatch(sck, /instagram|stories|black/);
  }
});
