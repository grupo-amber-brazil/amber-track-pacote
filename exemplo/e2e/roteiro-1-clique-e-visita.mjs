// Roteiro 1 — Clique e visita (03 §10).
// Antes: crie um link e um clique na Dash local (E2E_CLIQUE) e abra no Chromium
//   http://localhost:3100/?atk=<E2E_CLIQUE>&utm_source=e2e
// uma vez. Depois rode: npm run e2e:1
import { ABV, CLIQUE, CLK, EXEMPLO_URL, PC, PONTO, confere, consultar, encerrar, exigir, fecharBanco } from "./comum.mjs";

exigir(CLK.test(CLIQUE), "defina E2E_CLIQUE com o clk_ do clique criado na Dash local.");
exigir(PC.test(PONTO), "defina AMBER_TRACK_PONTO com a chave pc_ do ponto.");

console.log("Roteiro 1 — clique e visita\n");

// 1. O proxy grava o _atk no servidor (o que o navegador recebe no primeiro request).
const r = await fetch(`${EXEMPLO_URL}/?atk=${CLIQUE}`, { redirect: "manual" });
const setCookies = r.headers.getSetCookie();
const atk = setCookies.find((c) => c.startsWith("_atk="));
confere(r.status === 200, "o exemplo responde 200, sem redirecionar", r.status);
confere(atk?.startsWith(`_atk=${CLIQUE};`), "Set-Cookie _atk com o clique", setCookies);
confere(/Max-Age=2592000/i.test(atk ?? ""), "_atk dura 30 dias");
confere(/Secure/i.test(atk ?? "") && /SameSite=lax/i.test(atk ?? ""), "_atk Secure e SameSite=Lax");
confere(!/HttpOnly/i.test(atk ?? "") && !/Domain=/i.test(atk ?? ""), "_atk sem HttpOnly e sem Domain");

// 2. A visita que o navegador mandou (AmberTrackVisita) chegou à Dash.
const [clique] = await consultar(`SELECT id FROM track_clicks WHERE code = $1`, [CLIQUE]);
confere(Boolean(clique), "o clique existe em track_clicks", CLIQUE);

const visitas = await consultar(
  `SELECT e.id, e.click_id, e.click_code, e.visitor_id, e.page_path, e.utm_source, e.package_version
     FROM track_click_events e JOIN track_capture_points p ON p.id = e.capture_point_id
    WHERE e.kind = 'visit' AND p.public_key = $1 AND e.click_code = $2
    ORDER BY e.occurred_at`,
  [PONTO, CLIQUE],
);
confere(visitas.length === 1, "uma visita em track_click_events para o ponto e o clique", `${visitas.length} visitas (abra a página uma vez só)`);
const visita = visitas.at(-1);
if (visita) {
  confere(visita.click_id === clique?.id, "track_click_events.click_id aponta para o clique");
  confere(ABV.test(visita.visitor_id ?? ""), "a visita leva o _abv do exemplo", visita.visitor_id);
  confere(visita.package_version === "0.1.0", "package_version = 0.1.0", visita.package_version);
}

// 3. O par clique ↔ visitante, gravado pela Dash a partir da visita.
const pares = await consultar(`SELECT visitor_id, source FROM track_click_visitors WHERE click_id = $1`, [clique?.id ?? null]);
confere(
  pares.some((p) => p.visitor_id === visita?.visitor_id && p.source === "pacote_visita"),
  "par em track_click_visitors com o _abv do exemplo e source = pacote_visita",
  pares,
);

await fecharBanco();
encerrar("Roteiro 1");
