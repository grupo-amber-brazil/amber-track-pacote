// AC simulado por interceptador de `fetch`, carregado antes do app:
//
//   node --import <caminho>/ac-simulado.mjs …        (ou NODE_OPTIONS="--import <url do arquivo>")
//
// Toda chamada a um host do ActiveCampaign (`*.api-us1.com`, `*.activehosted.com`) ou a
// `ac-simulado.localhost` é respondida aqui, sem rede, e vira uma linha no log JSONL. Assim o AC de
// verdade nunca é chamado, mesmo que a env aponte para uma conta real. Serve aos dois lados do E2E:
// o exemplo (o "caminho da página") e o worker/web da Dash local (a entrega "Pelo Amber Track").
//
// Envs:
//   AC_SIMULADO_LOG        arquivo JSONL do log (padrão: ./ac-simulado.jsonl no diretório atual)
//   AC_SIMULADO_ORIGEM     quem chama: "exemplo", "dash-worker", "dash-web" (vai em cada linha)
//   AC_SIMULADO_CONTROLE   arquivo JSON opcional, relido a cada chamada, para injetar falha:
//                          {"falhar": {"contactLists": {"status": 503, "vezes": 1}}}
//                          A chave é o primeiro segmento depois de /api/3/. "vezes" desce a cada uso.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const LOG = resolve(process.env.AC_SIMULADO_LOG ?? "ac-simulado.jsonl");
const CONTROLE = process.env.AC_SIMULADO_CONTROLE ? resolve(process.env.AC_SIMULADO_CONTROLE) : null;
const ORIGEM = process.env.AC_SIMULADO_ORIGEM ?? "desconhecida";

const HOSTS_DO_AC = /(^|\.)api-us1\.com$|(^|\.)activehosted\.com$|^ac-simulado\.localhost$/i;

const original = globalThis.fetch;

/** Id estável por texto: o mesmo e-mail recebe sempre o mesmo id de contato. */
const idDe = (texto) => String(parseInt(createHash("sha256").update(String(texto)).digest("hex").slice(0, 8), 16) % 900000 + 100000);

function lerControle() {
  if (!CONTROLE || !existsSync(CONTROLE)) return null;
  try {
    return JSON.parse(readFileSync(CONTROLE, "utf8"));
  } catch {
    return null;
  }
}

/** Falha injetada para este recurso, se houver; consome uma "vez". */
function falhaPara(recurso) {
  const controle = lerControle();
  const regra = controle?.falhar?.[recurso];
  if (!regra) return null;
  if (typeof regra.vezes === "number") {
    if (regra.vezes <= 0) return null;
    regra.vezes -= 1;
    try {
      writeFileSync(CONTROLE, JSON.stringify(controle, null, 2));
    } catch {
      // segue
    }
  }
  return regra.status ?? 503;
}

function registrar(linha) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(linha) + "\n");
  } catch {
    // o log nunca derruba o app
  }
}

function responder(metodo, url, corpo) {
  const partes = url.pathname.replace(/^\/api\/3\//, "").split("/").filter(Boolean);
  const recurso = partes[0] ?? "";
  const falha = falhaPara(recurso);
  if (falha) return { status: falha, json: { errors: [{ title: `falha simulada ${falha}` }] } };

  if (metodo === "POST" && recurso === "contact" && partes[1] === "sync") {
    const email = corpo?.contact?.email ?? "";
    return { status: 201, json: { contact: { id: idDe(email), email } } };
  }
  if (recurso === "contacts" && metodo === "GET") {
    const email = url.searchParams.get("email");
    return { status: 200, json: { contacts: email ? [{ id: idDe(email), email }] : [], meta: { total: email ? "1" : "0" } } };
  }
  if (metodo === "POST" && recurso === "contactTags") {
    const ct = corpo?.contactTag ?? {};
    return { status: 201, json: { contactTag: { id: idDe(`${ct.contact}:${ct.tag}`), contact: String(ct.contact), tag: String(ct.tag) } } };
  }
  if (metodo === "POST" && recurso === "contactLists") {
    const cl = corpo?.contactList ?? {};
    return { status: 200, json: { contactList: { id: idDe(`${cl.contact}:${cl.list}`), contact: String(cl.contact), list: String(cl.list), status: String(cl.status ?? 1) } } };
  }
  if (recurso === "tags" && metodo === "GET") {
    if (partes[1]) return { status: 200, json: { tag: { id: partes[1], tag: `tag-${partes[1]}` } } };
    const busca = url.searchParams.get("search") ?? url.searchParams.get("filters[search]") ?? "";
    return { status: 200, json: { tags: busca ? [{ id: idDe(`tag:${busca}`), tag: busca }] : [], meta: { total: busca ? "1" : "0" } } };
  }
  if (recurso === "lists" && metodo === "GET") {
    if (partes[1]) return { status: 200, json: { list: { id: partes[1], name: `Lista ${partes[1]}` } } };
    return { status: 200, json: { lists: [], meta: { total: "0" } } };
  }
  if (recurso === "fields" && metodo === "GET") return { status: 200, json: { fields: [], meta: { total: "0" } } };
  if (recurso === "fieldValues") return { status: 200, json: { fieldValue: {} } };
  return { status: 200, json: {} };
}

async function lerCorpo(input, init) {
  try {
    if (init && typeof init.body === "string") return init.body;
    if (input instanceof Request) return await input.clone().text();
  } catch {
    // sem corpo
  }
  return "";
}

globalThis.fetch = async function fetchComAcSimulado(input, init) {
  let url;
  try {
    url = new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return original(input, init);
  }
  if (!HOSTS_DO_AC.test(url.hostname)) return original(input, init);

  const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const texto = await lerCorpo(input, init);
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  const { status, json } = responder(metodo, url, corpo);
  registrar({
    em: new Date().toISOString(),
    origem: ORIGEM,
    metodo,
    caminho: url.pathname + url.search,
    status,
    corpo,
    resposta: json,
  });
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
};

globalThis.__amberAcSimulado = true;
