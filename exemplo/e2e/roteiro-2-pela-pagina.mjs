// Roteiro 2 — Ponto "Pela página" (03 §10).
// Antes: o ponto de AMBER_TRACK_PONTO está "Pela página" na Dash local; o exemplo roda com
// `npm run dev:e2e` (AC simulado carregado). Rode: npm run e2e:2
import {
  CLIQUE,
  CLK,
  PC,
  PONTO,
  abvDeTeste,
  aguardar,
  confere,
  emailDeTeste,
  encerrar,
  exigir,
  fecharBanco,
  leadPorEmail,
  lerLogDoAc,
  mandarFormulario,
} from "./comum.mjs";

exigir(PC.test(PONTO), "defina AMBER_TRACK_PONTO.");
exigir(CLK.test(CLIQUE), "defina E2E_CLIQUE (o clk_ do roteiro 1).");

console.log("Roteiro 2 — ponto Pela página\n");
const desde = new Date().toISOString();
const email = emailDeTeste("r2");
const abv = abvDeTeste();
const utms = { utm_source: "e2e", utm_medium: "roteiro-2", utm_campaign: "pela-pagina" };

const r = await mandarFormulario({ email, cookies: { _atk: CLIQUE, _abv: abv }, utms });
confere(r.status === 200, "o exemplo responde 200", r);
confere(r.corpo?.entrega === "pagina" && r.corpo?.motivo === "modo_pagina", "resposta da API: entrega pagina (modo_pagina)", r.corpo);
confere(r.corpo?.ac === "ok", "o caminho da página chamou o AC simulado e relatou ok", r.corpo);

const lead = await aguardar(() => leadPorEmail(email), (l) => l?.ac_status === "page_ok", { prazoMs: 20_000 });
confere(Boolean(lead), "lead em track_leads", email);
if (lead) {
  confere(lead.public_key === PONTO, "lead do ponto certo");
  confere(lead.ac_mode === "page", "ac_mode = page", lead.ac_mode);
  confere(lead.ac_status === "page_ok", "ac_status = page_ok (relato ok)", lead.ac_status);
  confere(lead.click_code === CLIQUE && lead.click_id !== null, "click_code e click_id do clique", { click_code: lead.click_code, click_id: lead.click_id });
  confere(lead.visitor_id === abv, "visitor_id = o abv_ do cookie", lead.visitor_id);
  confere(
    lead.utm_source === "e2e" && lead.utm_medium === "roteiro-2" && lead.utm_campaign === "pela-pagina",
    "as UTMs do formulário",
    { utm_source: lead.utm_source, utm_medium: lead.utm_medium, utm_campaign: lead.utm_campaign },
  );
  confere(lead.ac_page_report?.resultado === "ok", "ac_page_report.resultado = ok", lead.ac_page_report);
  confere(lead.package_version === "0.1.0" && lead.api_version === 1, "package_version 0.1.0 e api_version 1", {
    package_version: lead.package_version,
    api_version: lead.api_version,
  });
}

const log = lerLogDoAc(desde);
const doExemplo = log.filter((l) => l.origem === "exemplo");
const contatoDoExemplo = doExemplo.find((l) => l.caminho.startsWith("/api/3/contact/sync") && l.corpo?.contact?.email === email);
confere(Boolean(contatoDoExemplo), "o log do AC simulado tem o contact/sync do exemplo para o e-mail");
const idDoContato = contatoDoExemplo?.resposta?.contact?.id;
const daDash = log.filter(
  (l) => l.origem.startsWith("dash") && (l.corpo?.contact?.email === email || String(l.corpo?.contactTag?.contact ?? l.corpo?.contactList?.contact ?? "") === String(idDoContato)),
);
confere(daDash.length === 0, "nenhuma chamada ao AC vinda da Dash para este lead", daDash);

console.log("\nLog do AC simulado deste roteiro:");
for (const l of log) console.log(`  ${l.em} ${l.origem.padEnd(12)} ${l.metodo} ${l.caminho} → ${l.status}`);

await fecharBanco();
encerrar("Roteiro 2");
