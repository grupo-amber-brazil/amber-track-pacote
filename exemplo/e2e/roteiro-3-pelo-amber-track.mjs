// Roteiro 3 — Ponto "Pelo Amber Track" (03 §10).
// Antes: TRACK_AC_DELIVERY_ENABLED=true no web e no worker da Dash local; o ponto passou a
// "Pelo Amber Track"; o worker da Dash local roda com o AC simulado carregado
// (NODE_OPTIONS="--import <url de e2e/ac-simulado.mjs>", AC_SIMULADO_ORIGEM=dash-worker e o MESMO
// AC_SIMULADO_LOG e AC_SIMULADO_CONTROLE do exemplo). Rode: npm run e2e:3
import {
  PC,
  PONTO,
  aguardar,
  confere,
  definirControleDoAc,
  emailDeTeste,
  encerrar,
  exigir,
  fecharBanco,
  leadPorEmail,
  lerLogDoAc,
  mandarFormulario,
} from "./comum.mjs";

exigir(PC.test(PONTO), "defina AMBER_TRACK_PONTO.");

/** Chamadas do worker para o contato deste e-mail, na ordem. */
function chamadasDoWorker(desde, email) {
  const log = lerLogDoAc(desde).filter((l) => l.origem === "dash-worker");
  const sync = log.find((l) => l.caminho.startsWith("/api/3/contact/sync") && l.corpo?.contact?.email === email);
  const id = sync?.resposta?.contact?.id;
  return log.filter(
    (l) =>
      l.metodo === "POST" &&
      (l === sync || String(l.corpo?.contactTag?.contact ?? l.corpo?.contactList?.contact ?? "") === String(id ?? "-")),
  );
}

const recurso = (l) => l.caminho.replace(/^\/api\/3\//, "").split("?")[0];

console.log("Roteiro 3 — ponto Pelo Amber Track\n");
definirControleDoAc({});

// Parte A: entrega completa.
let desde = new Date().toISOString();
const emailA = emailDeTeste("r3a");
const a = await mandarFormulario({ email: emailA });
confere(a.corpo?.entrega === "track" && a.corpo?.motivo === "track_entrega", "resposta da API: entrega track", a.corpo);
const leadA = await aguardar(() => leadPorEmail(emailA), (l) => l?.ac_status === "delivered", { prazoMs: 60_000 });
confere(leadA?.ac_mode === "track", "ac_mode = track", leadA?.ac_mode);
confere(leadA?.ac_status === "delivered", "ac_status = delivered", leadA?.ac_status);
confere(
  lerLogDoAc(desde).filter((l) => l.origem === "exemplo" && l.corpo?.contact?.email === emailA).length === 0,
  "o exemplo não chamou o AC",
);
const ordemA = chamadasDoWorker(desde, emailA).map(recurso);
confere(ordemA[0] === "contact/sync", "o worker começa pelo contact/sync", ordemA);
confere(
  /^contact\/sync(,contactTags)+(,contactLists)?$/.test(ordemA.join(",")),
  "ordem contato → tags (extras, principal por último) → lista, cada uma uma vez",
  ordemA,
);
const tagsA = chamadasDoWorker(desde, emailA).filter((l) => recurso(l) === "contactTags").map((l) => l.corpo?.contactTag?.tag);
console.log(`  (tags na ordem aplicada: ${JSON.stringify(tagsA)}; a última tem de ser a principal do ponto)`);

// Parte B: 503 na lista; a nova tentativa chama só a lista.
desde = new Date().toISOString();
definirControleDoAc({ falhar: { contactLists: { status: 503, vezes: 1 } } });
const emailB = emailDeTeste("r3b");
const b = await mandarFormulario({ email: emailB });
confere(b.corpo?.entrega === "track", "resposta da API: entrega track", b.corpo);
console.log("  (esperando a nova tentativa do job: 30 s de espera exponencial, até 120 s)");
const leadB = await aguardar(() => leadPorEmail(emailB), (l) => l?.ac_status === "delivered", { prazoMs: 120_000, intervaloMs: 2_000 });
confere(leadB?.ac_status === "delivered", "ac_status = delivered depois da nova tentativa", leadB?.ac_status);
confere(leadB?.ac_list_done === true, "ac_list_done = true", leadB?.ac_list_done);
const chamadasB = chamadasDoWorker(desde, emailB);
const falha = chamadasB.findIndex((l) => recurso(l) === "contactLists" && l.status === 503);
confere(falha >= 0, "a primeira contactLists recebeu 503", chamadasB.map((l) => `${recurso(l)} ${l.status}`));
const depois = chamadasB.slice(falha + 1).map(recurso);
confere(
  depois.length === 1 && depois[0] === "contactLists",
  "a nova tentativa chama só a lista (contato e tags não se repetem)",
  depois,
);
definirControleDoAc({});

console.log("\nChamadas do worker (parte B):");
for (const l of chamadasB) console.log(`  ${l.em} ${l.metodo} ${l.caminho} → ${l.status}`);

await fecharBanco();
encerrar("Roteiro 3");
