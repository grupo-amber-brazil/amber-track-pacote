import { AmberTrackVisita } from "@amber/track/client";
import { Checkout } from "./checkout";
import { Formulario } from "./formulario";

// Lê o ponto a cada request: trocar o ponto no `.env.local` não pede build novo.
export const dynamic = "force-dynamic";

export default function Pagina() {
  const ponto = process.env.AMBER_TRACK_PONTO ?? "";
  return (
    <main>
      <h1>Exemplo @amber/track</h1>
      {ponto ? (
        <AmberTrackVisita ponto={ponto} />
      ) : (
        <p role="alert">Defina AMBER_TRACK_PONTO no .env.local (a chave pc_ de um ponto da Dash local).</p>
      )}
      <Formulario />
      <Checkout />
    </main>
  );
}
