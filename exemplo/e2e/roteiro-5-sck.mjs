// Roteiro 5 — sck (03 §10).
// Antes: no mesmo Chromium do roteiro 1 (com o _atk e o _abv gravados), abra
//   http://localhost:3100/?utm_source=instagram&utm_medium=stories&utm_campaign=black
// copie o texto de "sck:" (o <code id="sck">) e rode: npm run e2e:5 -- "<sck copiado>"
import { ABV, CLIQUE, CLK, PONTO, confere, consultar, encerrar, exigir, fecharBanco } from "./comum.mjs";

const sck = process.argv[2] ?? "";
exigir(sck, 'passe o sck copiado da página: npm run e2e:5 -- "<sck>"');
exigir(CLK.test(CLIQUE), "defina E2E_CLIQUE (o clk_ do roteiro 1).");

console.log("Roteiro 5 — sck\n");
const campos = sck.split("|");
confere(campos.length === 7, "sete campos na Hotmart", campos);
confere(campos[6] === CLIQUE, "o sétimo campo é o clk_ do clique", campos[6]);
confere(ABV.test(campos[5] ?? ""), "o sexto campo é um abv_", campos[5]);
confere(campos[0] === "instagram" && campos[1] === "stories" && campos[2] === "black", "as UTMs da URL nos três primeiros campos", campos.slice(0, 5));
confere(sck.length <= 255, "até 255 caracteres", sck.length);

// O abv_ do sck é o mesmo visitante que a visita do roteiro 1 levou.
const visitas = await consultar(
  `SELECT DISTINCT e.visitor_id
     FROM track_click_events e JOIN track_capture_points p ON p.id = e.capture_point_id
    WHERE e.kind = 'visit' AND p.public_key = $1 AND e.click_code = $2`,
  [PONTO, CLIQUE],
);
confere(
  visitas.some((v) => v.visitor_id === campos[5]),
  "o abv_ do sck é o visitante da visita do roteiro 1",
  visitas,
);

await fecharBanco();
encerrar("Roteiro 5");
