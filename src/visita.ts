/**
 * A visita do navegador, sem React: monta o corpo de `POST /api/track/v1/eventos` e manda por
 * `navigator.sendBeacon`. O ambiente do navegador entra por parâmetro, para o teste rodar no
 * Node. Disparo cego: nenhuma promessa volta para a tela, nenhum erro sobe.
 */
import { COOKIE_DO_CLIQUE, COOKIE_DO_VISITANTE, ehCodigoDoClique, ehVisitante, lerCookies, textoOuNada } from "./formatos.js";
import type { CorpoVisita } from "./tipos.js";
import { VERSAO_DO_PACOTE } from "./versao.js";

/** Teto do corpo da visita na API. */
export const TETO_DA_VISITA_BYTES = 4096;

export type AmbienteDoNavegador = {
  /** `location.href` */
  href: string;
  /** `document.cookie` */
  cookie: string;
  /** `document.referrer` */
  referrer: string;
  sendBeacon?: (url: string, dados: Blob) => boolean;
  fetch?: typeof fetch;
};

const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const bytes = (texto: string): number => new TextEncoder().encode(texto).length;

function hostDoReferrer(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    return textoOuNada(new URL(referrer).host, 255);
  } catch {
    return undefined;
  }
}

/** Corpo da visita: ponto, caminho, UTMs da URL, `atk` (query ou cookie), `abv` (cookie) e o host de origem. */
export function montarCorpoVisita(ponto: string, ambiente: Pick<AmbienteDoNavegador, "href" | "cookie" | "referrer">): CorpoVisita {
  const url = new URL(ambiente.href);
  const cookies = lerCookies(ambiente.cookie);
  const corpo: CorpoVisita = {
    v: 1,
    pacote: VERSAO_DO_PACOTE,
    ponto,
    tipo: "visita",
    caminho: (url.pathname || "/").slice(0, 200),
  };
  const atkDaQuery = url.searchParams.get("atk");
  const atkDoCookie = cookies.get(COOKIE_DO_CLIQUE);
  const atk = ehCodigoDoClique(atkDaQuery) ? atkDaQuery : ehCodigoDoClique(atkDoCookie) ? atkDoCookie : undefined;
  if (atk) corpo.atk = atk;
  const abv = cookies.get(COOKIE_DO_VISITANTE);
  if (ehVisitante(abv)) corpo.abv = abv;
  for (const utm of UTMS) {
    const valor = textoOuNada(url.searchParams.get(utm), 255);
    if (valor !== undefined) corpo[utm] = valor;
  }
  const referrerHost = hostDoReferrer(ambiente.referrer);
  if (referrerHost !== undefined) corpo.referrer_host = referrerHost;
  return cabeNoTeto(corpo);
}

/**
 * Garante o teto de 4 KB mesmo com UTM cheia de caractere que o JSON escapa: corta pela metade
 * o maior texto opcional até caber.
 */
function cabeNoTeto(corpo: CorpoVisita): CorpoVisita {
  const opcionais = [...UTMS, "referrer_host"] as const;
  let guarda = 0;
  while (bytes(JSON.stringify(corpo)) > TETO_DA_VISITA_BYTES && guarda++ < 64) {
    let maior: (typeof opcionais)[number] | null = null;
    for (const chave of opcionais) {
      const v = corpo[chave];
      if (v !== undefined && (maior === null || v.length > (corpo[maior] ?? "").length)) maior = chave;
    }
    if (maior === null) break;
    const atual = corpo[maior] ?? "";
    const metade = atual.slice(0, Math.floor(atual.length / 2));
    if (metade) corpo[maior] = metade;
    else delete corpo[maior];
  }
  return corpo;
}

/**
 * Trava em memória do módulo: uma visita por ponto e caminho em cada carregamento de página.
 * Segura o `useEffect` duplo do React em desenvolvimento.
 */
export function criarRegistroDeVisitas() {
  const enviadas = new Set<string>();
  return function registrarVisita(ponto: string, ambiente: AmbienteDoNavegador, endereco: string): boolean {
    try {
      const corpo = montarCorpoVisita(ponto, ambiente);
      const trava = `${ponto}|${corpo.caminho}`;
      if (enviadas.has(trava)) return false;
      enviadas.add(trava);
      const destino = `${endereco.replace(/\/+$/, "")}/api/track/v1/eventos`;
      const texto = JSON.stringify(corpo);
      let foi = false;
      if (typeof ambiente.sendBeacon === "function") {
        try {
          foi = ambiente.sendBeacon(destino, new Blob([texto], { type: "text/plain" }));
        } catch {
          foi = false;
        }
      }
      if (!foi && typeof ambiente.fetch === "function") {
        void ambiente
          .fetch(destino, {
            method: "POST",
            body: texto,
            headers: { "Content-Type": "text/plain" },
            keepalive: true,
            credentials: "omit",
          })
          .catch(() => undefined);
      }
      return true;
    } catch {
      return false;
    }
  };
}
