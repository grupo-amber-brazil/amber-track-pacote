// Relé HTTP entre o exemplo e a Dash local, com chave de liga/desliga. Serve ao roteiro 4: "a Dash
// fora do ar" vira o relé parar de escutar (conexão recusada, como uma Dash parada), e "religar"
// volta em menos de 1 s, sem esperar a Dash compilar de novo.
//
//   npm run e2e:rele        (escuta em E2E_RELE_PORTA, padrão 3999, e repassa para E2E_DASH_DIRETA)
//
// No .env.local do exemplo: AMBER_TRACK_URL=http://localhost:3999. O Host repassado é o da Dash
// direta, para a Dash não confundir o pedido com um domínio de links.
// Controle: o arquivo E2E_RELE_CONTROLE (padrão e2e/saida/rele.json) com {"fora": true|false},
// relido a cada 200 ms. O roteiro 4 escreve nele.
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PORTA = Number(process.env.E2E_RELE_PORTA ?? 3999);
const ALVO = new URL(process.env.E2E_DASH_DIRETA ?? "http://localhost:3000");
const CONTROLE = resolve(process.env.E2E_RELE_CONTROLE ?? "e2e/saida/rele.json");

if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(ALVO.hostname)) {
  console.error(`E2E_DASH_DIRETA tem de ser local (veio ${ALVO.hostname}).`);
  process.exit(2);
}

mkdirSync(dirname(CONTROLE), { recursive: true });
if (!existsSync(CONTROLE)) writeFileSync(CONTROLE, JSON.stringify({ fora: false }));

const servidor = http.createServer((req, res) => {
  const pedido = http.request(
    {
      hostname: ALVO.hostname,
      port: ALVO.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: ALVO.host },
    },
    (resposta) => {
      res.writeHead(resposta.statusCode ?? 502, resposta.headers);
      resposta.pipe(res);
    },
  );
  pedido.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(pedido);
});

let escutando = false;
function aplicar() {
  let fora = false;
  try {
    fora = JSON.parse(readFileSync(CONTROLE, "utf8")).fora === true;
  } catch {
    fora = false;
  }
  if (fora && escutando) {
    servidor.close();
    servidor.closeAllConnections?.();
    escutando = false;
    console.log(`[relé] ${new Date().toISOString()} FORA: a porta ${PORTA} recusa conexão`);
  } else if (!fora && !escutando) {
    servidor.listen(PORTA, () => console.log(`[relé] ${new Date().toISOString()} NO AR: ${PORTA} → ${ALVO.host}`));
    escutando = true;
  }
}

aplicar();
setInterval(aplicar, 200);
