// Roteiro 4 — Dash fora do ar (03 §10).
// Antes: o ponto volta a "Pela página"; o relé roda (`npm run e2e:rele`) e o exemplo fala com a
// Dash por ele (AMBER_TRACK_URL=http://localhost:3999); o exemplo roda com `npm run dev:e2e`.
// Rode: npm run e2e:4. O script desliga o relé (para o exemplo, a Dash está fora: conexão
// recusada), manda o formulário, religa o relé 5 s depois (dentro dos 10 s do reenvio tardio) e
// confere o lead.
import {
  PC,
  PONTO,
  aguardar,
  confere,
  dashNoAr,
  emailDeTeste,
  encerrar,
  exigir,
  fecharBanco,
  leadPorEmail,
  lerLogDoAc,
  mandarFormulario,
  releFora,
} from "./comum.mjs";

exigir(PC.test(PONTO), "defina AMBER_TRACK_PONTO.");
exigir(await dashNoAr(), "a Dash não responde pelo relé. Suba a Dash local e `npm run e2e:rele`.");

console.log("Roteiro 4 — Dash fora do ar\n");
await releFora(true);
exigir(!(await dashNoAr()), "o relé não desligou: confira E2E_RELE_CONTROLE e o terminal do relé.");

const desde = new Date().toISOString();
const email = emailDeTeste("r4");
let r;
try {
  r = await mandarFormulario({ email });
} finally {
  // "Religada a Dash dentro de 10 s": 5 s depois da inscrição.
  setTimeout(() => void releFora(false), 5_000);
}
console.log(`  (inscrição respondeu em ${r.ms} ms)`);
confere(r.status === 200 && r.corpo?.entrega === "pagina", "a inscrição termina pelo caminho da página", r.corpo);
confere(["tempo_esgotado", "recusado"].includes(r.corpo?.motivo), "motivo tempo_esgotado ou recusado", r.corpo?.motivo);
confere(r.ms < 2_000 + 1_500, "terminou em até 2 s a mais (folga de 1,5 s para o caminho simulado)", r.ms);
confere(
  lerLogDoAc(desde).some((l) => l.origem === "exemplo" && l.corpo?.contact?.email === email),
  "o caminho simulado da página chamou o AC simulado",
);

console.log("  (relé volta em 5 s; o reenvio tardio sai aos 10 s e tenta de novo aos 15 s e aos 20 s)");
const lead = await aguardar(() => leadPorEmail(email), (l) => Boolean(l), { prazoMs: 45_000, intervaloMs: 1_000 });
confere(Boolean(lead), "o lead apareceu, criado pelo reenvio tardio", email);
if (lead) {
  confere(lead.ac_mode === "page", "ac_mode = page", lead.ac_mode);
  confere(lead.ac_status === "page_ok", "nasceu já no estado do relato: page_ok", lead.ac_status);
  confere(lead.ac_page_report?.resultado === "ok", "ac_page_report.resultado = ok (o relato foi junto, em entrega_pagina)", lead.ac_page_report);
  const segundos = (new Date(lead.created_at).getTime() - new Date(desde).getTime()) / 1000;
  console.log(`  (lead criado ${segundos.toFixed(1)} s depois do envio; o esperado é ~10 s)`);
}

await releFora(false);
await fecharBanco();
encerrar("Roteiro 4");
