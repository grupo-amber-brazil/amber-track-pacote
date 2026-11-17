import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { VERSAO_DO_PACOTE } from "../src/versao.js";

// Compilado em .test-out/test/: a raiz do pacote fica dois níveis acima.
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports: Record<string, { types: string; default: string }>;
  files: string[];
};

test("dependencies vazio: o install da página não puxa árvore nova", () => {
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  assert.deepEqual(pkg.peerDependencies, { next: ">=15.1 <17", react: ">=18" });
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}).sort(), ["@types/node", "@types/react", "next", "react", "typescript"]);
});

test("dist/client.js começa com \"use client\" depois do build", () => {
  const client = readFileSync(join(RAIZ, "dist", "client.js"), "utf8");
  assert.match(client, /^"use client";/);
});

test("os quatro caminhos de exports existem em dist", () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./client", "./proxy", "./server"]);
  for (const [entrada, alvo] of Object.entries(pkg.exports)) {
    for (const arquivo of [alvo.types, alvo.default]) {
      assert.match(arquivo, /^\.\/dist\//, `${entrada} aponta para dist`);
      assert.ok(existsSync(join(RAIZ, arquivo)), `${entrada}: ${arquivo} existe`);
    }
  }
});

test("files não inclui exemplo/ nem test/", () => {
  assert.deepEqual(pkg.files, ["dist", "src"]);
});

test("a versão no código é a do package.json", () => {
  assert.equal(VERSAO_DO_PACOTE, pkg.version);
});

test("dist/ está em dia com src/ (o build foi rodado e commitado)", () => {
  // O tsconfig.test.json compila os mesmos src/ com as mesmas opções de saída JS.
  const compilados = join(RAIZ, ".test-out", "src");
  for (const nome of readdirSync(compilados).filter((n) => n.endsWith(".js"))) {
    const noDist = join(RAIZ, "dist", nome);
    assert.ok(existsSync(noDist), `dist/${nome} existe`);
    const normalizar = (t: string) => t.replace(/\r\n/g, "\n");
    assert.equal(
      normalizar(readFileSync(noDist, "utf8")),
      normalizar(readFileSync(join(compilados, nome), "utf8")),
      `dist/${nome} igual ao build de src/${nome.replace(/\.js$/, ".ts")}: rode npm run build`,
    );
  }
});
