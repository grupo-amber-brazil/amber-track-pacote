// Peças comuns dos roteiros do E2E. Só LEITURA no banco: a sessão é aberta em modo somente
// leitura e o host tem de ser local. O AC é o simulado (ac-simulado.mjs); nada aqui chama o AC.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

export const EXEMPLO_URL = (process.env.EXEMPLO_URL ?? "http://localhost:3100").replace(/\/+$/, "");
export const DASH_URL = (process.env.AMBER_TRACK_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const PONTO = process.env.AMBER_TRACK_PONTO ?? "";
export const CLIQUE = process.env.E2E_CLIQUE ?? "";
export const LOG_DO_AC = resolve(process.env.AC_SIMULADO_LOG ?? "e2e/saida/ac-simulado.jsonl");
export const CONTROLE_DO_AC = resolve(process.env.AC_SIMULADO_CONTROLE ?? "e2e/saida/ac-simulado-controle.json");
export const CONTROLE_DO_RELE = resolve(process.env.E2E_RELE_CONTROLE ?? "e2e/saida/rele.json");

export const CLK = /^clk_[0-9A-HJKMNP-TV-Z]{16}$/;
export const ABV = /^abv_[a-z0-9]{16}$/;
export const PC = /^pc_[0-9A-HJKMNP-TV-Z]{16}$/;

let falhas = 0;

export function confere(condicao, descricao, detalhe) {
  if (condicao) {
    console.log(`  ok    ${descricao}`);
  } else {
    falhas += 1;
    console.log(`  FALHOU ${descricao}${detalhe !== undefined ? `\n         ${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)}` : ""}`);
  }
  return Boolean(condicao);
}

export function encerrar(nome) {
  console.log(falhas === 0 ? `\n${nome}: PASSOU` : `\n${nome}: ${falhas} conferência(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
}

export function exigir(condicao, mensagem) {
  if (!condicao) {
    console.error(`Antes de rodar: ${mensagem}`);
    process.exit(2);
  }
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Repete `consulta` até `pronto(resultado)` ou o prazo. Devolve o último resultado. */
export async function aguardar(consulta, pronto, { prazoMs = 30_000, intervaloMs = 1_000 } = {}) {
  const fim = Date.now() + prazoMs;
  let ultimo;
  do {
    ultimo = await consulta();
    if (pronto(ultimo)) return ultimo;
    await esperar(intervaloMs);
  } while (Date.now() < fim);
  return ultimo;
}

/** E-mail único e fictício por execução. */
export const emailDeTeste = (roteiro) => `e2e-${roteiro}-${Date.now()}@example.com`;

/** `abv_` de teste, como o proxy do exemplo grava. */
export function abvDeTeste() {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "abv_" + [...randomBytes(16)].map((b) => alfabeto[b % alfabeto.length]).join("");
}

let cliente = null;

/** Postgres da Dash LOCAL, só leitura. Recusa host que não seja local. */
export async function banco() {
  if (cliente) return cliente;
  const url = process.env.E2E_DATABASE_URL;
  exigir(url, "defina E2E_DATABASE_URL (Postgres da Dash local) no .env.local.");
  const host = new URL(url).hostname;
  exigir(["localhost", "127.0.0.1", "::1", "[::1]"].includes(host), `E2E_DATABASE_URL tem de ser local (veio ${host}).`);
  cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  await cliente.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  return cliente;
}

export async function consultar(sql, params = []) {
  const c = await banco();
  return (await c.query(sql, params)).rows;
}

export async function fecharBanco() {
  if (cliente) await cliente.end().catch(() => undefined);
  cliente = null;
}

/** Linhas do log do AC simulado (opcionalmente só as escritas depois de `desde`). */
export function lerLogDoAc(desde) {
  if (!existsSync(LOG_DO_AC)) return [];
  return readFileSync(LOG_DO_AC, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => !desde || l.em >= desde);
}

export function definirControleDoAc(controle) {
  mkdirSync(dirname(CONTROLE_DO_AC), { recursive: true });
  writeFileSync(CONTROLE_DO_AC, JSON.stringify(controle, null, 2));
}

/** Manda o formulário do exemplo como a página manda (POST JSON em /api/captura). */
export async function mandarFormulario({ email, cookies = {}, utms = {}, telefone = "11900000000" }) {
  const cookie = Object.entries(cookies)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const inicio = Date.now();
  const resposta = await fetch(`${EXEMPLO_URL}/api/captura`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ nome: "Pessoa Teste", email, telefone, objetivo: "teste-e2e", pagina: "/", ...utms }),
  });
  const corpo = await resposta.json().catch(() => null);
  return { status: resposta.status, corpo, ms: Date.now() - inicio };
}

export async function leadPorEmail(email) {
  const linhas = await consultar(
    `SELECT l.*, p.public_key
       FROM track_leads l JOIN track_capture_points p ON p.id = l.capture_point_id
      WHERE l.email_norm = lower(trim($1))
      ORDER BY l.created_at DESC LIMIT 1`,
    [email],
  );
  return linhas[0] ?? null;
}

/** Liga ou desliga o relé entre o exemplo e a Dash (e2e/rele.mjs). */
export async function releFora(fora) {
  mkdirSync(dirname(CONTROLE_DO_RELE), { recursive: true });
  writeFileSync(CONTROLE_DO_RELE, JSON.stringify({ fora }));
  await esperar(600);
}

/** A Dash como o exemplo a enxerga (AMBER_TRACK_URL, que no E2E é o relé). */
export async function dashNoAr() {
  try {
    const r = await fetch(`${DASH_URL}/api/track/v1/eventos`, { method: "OPTIONS", signal: AbortSignal.timeout(2_000) });
    return r.status !== 502; // 502: o relé está no ar, mas a Dash atrás dele não
  } catch {
    return false;
  }
}
