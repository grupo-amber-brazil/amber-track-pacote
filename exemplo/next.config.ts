import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// O exemplo mora dentro do repositório do pacote, que tem o próprio package-lock.json. Sem a
// raiz explícita, o Next tomaria a pasta de cima como raiz do projeto.
const raiz = fileURLToPath(new URL(".", import.meta.url));

const config: NextConfig = {
  turbopack: { root: raiz },
  outputFileTracingRoot: raiz,
};

export default config;
