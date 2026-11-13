// Sobe o exemplo (`next dev -p 3100`) com o AC simulado carregado no processo do Next.
// Uso: npm run dev:e2e   (lê o .env.local)
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const aqui = fileURLToPath(new URL(".", import.meta.url));
const interceptador = pathToFileURL(resolve(aqui, "ac-simulado.mjs")).href;
const next = resolve(aqui, "..", "node_modules", "next", "dist", "bin", "next");

const env = {
  ...process.env,
  AC_SIMULADO_ORIGEM: "exemplo",
  AC_SIMULADO_LOG: resolve(process.env.AC_SIMULADO_LOG ?? resolve(aqui, "saida", "ac-simulado.jsonl")),
  AC_SIMULADO_CONTROLE: resolve(process.env.AC_SIMULADO_CONTROLE ?? resolve(aqui, "saida", "ac-simulado-controle.json")),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${interceptador}`.trim(),
};

console.log(`[e2e] AC simulado: log em ${env.AC_SIMULADO_LOG}`);
const filho = spawn(process.execPath, [next, "dev", "-p", "3100"], { cwd: resolve(aqui, ".."), env, stdio: "inherit" });
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
