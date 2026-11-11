# amber-track-pacote

Pacote `@amber/track`: liga uma página Next.js ao Amber Track. Grava o cookie do clique, manda o lead
e a visita, relata o que a página fez no caminho dela até o ActiveCampaign e monta o `sck` do
checkout. O agente da página instala, importa e passa o id do ponto: não escreve chamada de API.

## Instalar

Por tag git, sem registry do npm (o repositório é público, o build da página não pede credencial):

```bash
npm install github:grupo-amber-brazil/amber-track-pacote#v0.1.0
# ou
pnpm add github:grupo-amber-brazil/amber-track-pacote#v0.1.0
```

O `dist/` é versionado no git: o install já traz o JavaScript compilado. O install leva só `dist/` e
`src/` (`files` do `package.json`); `exemplo/`, `test/` e `contrato/` ficam fora.

> ⚠️ **Lockfile.** O lockfile guarda o commit, não a tag. Trocar a tag no `package.json` sem rodar o
> install deixa o lock no commit antigo, e o deploy sobe verde com o pacote velho. Passo a passo em
> [docs/atualizar-consumidor.md](docs/atualizar-consumidor.md).

Requisitos: Node 18 ou mais, `next` de 15.1 a 16 e `react` 18 ou mais (`peerDependencies`). O pacote
não tem nenhuma dependência de runtime.

## Envs do site

| Env | Onde | Valor |
|---|---|---|
| `AMBER_TRACK_URL` | env comum do servidor da página | `https://dash.grupoamber.com.br` |
| `AMBER_TRACK_SITE_SECRET` | segredo do servidor da página (cofre de infra) | `ats_…`, mostrado uma vez ao criar o site na Dash |
| `NEXT_PUBLIC_AMBER_TRACK_URL` | opcional, só em teste local | endereço da Dash local |

Sem `AMBER_TRACK_URL` ou `AMBER_TRACK_SITE_SECRET`, o pacote não chama nada, avisa uma vez no
`console.warn` e a página segue como hoje. O segredo permite gravar lead em nome do site: nunca no
código, nunca em `NEXT_PUBLIC_`.

## As quatro entradas

| Entrada | Exporta | Onde a página usa |
|---|---|---|
| `@amber/track/proxy` | `comAmberTrack(request, response)` | `proxy.ts` (Next 16) ou `middleware.ts` |
| `@amber/track/server` | `capturarLead(request, entrada)` e `relatarEntregaDaPagina(relato)` | rota de captura da página |
| `@amber/track/client` | `AmberTrackVisita({ ponto })` e `montarSck(gateway, utms, abv)` | página com formulário; link do checkout |
| `@amber/track` | só os tipos (`EntradaLead`, `ResultadoLead`, `RelatoDaPagina`, `Utms`, …) | — |

### Proxy

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server"
import { comAmberTrack } from "@amber/track/proxy"

export function proxy(request: NextRequest) {
  return comAmberTrack(request, NextResponse.next()) // ou a resposta que o proxy já devolve
}
```

Lê `atk` da query. Com o formato `clk_`, grava o cookie `_atk` no servidor: `Path=/`, 30 dias,
`Secure`, `SameSite=Lax`, sem `HttpOnly` (o navegador lê), sem `Domain`. Mesmo valor já gravado: não
manda `Set-Cookie`. Valor diferente: o clique mais novo vence. Não redireciona, não tira o `atk` da
URL, não mexe em outro cookie. No servidor porque cookie escrito por JavaScript dura 24 horas no
Safari quando a página chega por link decorado.

### Servidor

```ts
// app/api/captura/route.ts
import { capturarLead, relatarEntregaDaPagina } from "@amber/track/server"

export async function POST(request: Request) {
  const { nome, email, telefone, objetivo, utm_source, pagina } = await request.json()
  const contato = { nome, email, telefone }

  const r = await capturarLead(request, {
    ponto: "pc_3J7Q2X9KMTB4R8DA",
    contato,
    campos: { objetivo },
    marcas: { utm_source, pagina },
  })

  if (r.entregaPelaPagina) {
    // o caminho de hoje até o ActiveCampaign (contato, tags, lista)
    await relatarEntregaDaPagina({
      leadRef: r.leadRef,
      ponto: "pc_3J7Q2X9KMTB4R8DA",
      contato: { email, telefone },
      resultado: "ok", // "ok" | "pendente" | "erro"
      tags: ["[Exemplo] Lead"], // as que a página aplicou: dado informado, nunca instrução
      lista: 1,
    })
  }
  return Response.json({ ok: true })
}
```

`capturarLead` devolve `{ registrado, leadId, leadRef, entregaPelaPagina, motivo }`:

| Desfecho | `entregaPelaPagina` | `motivo` |
|---|---|---|
| sem as envs | `true` | `sem_configuracao` (nada é chamado; `leadRef: null`) |
| 200, o ponto entrega pela página | `true` | `modo_pagina` |
| 200, o Amber Track entrega | `false` (a página não chama o AC) | `track_entrega` |
| 2 s sem resposta | `true` | `tempo_esgotado` |
| rede, 4xx, 5xx | `true` | `recusado` |

A página nunca manda tag, lista nem campanha no lead: quem escolhe é o ponto, na Dash. O TypeScript
recusa esses campos, e a API também.

### Cliente

```tsx
import { AmberTrackVisita, montarSck } from "@amber/track/client"

<AmberTrackVisita ponto="pc_3J7Q2X9KMTB4R8DA" />

const sck = montarSck("hotmart", { utm_source, utm_medium, utm_campaign, utm_content, utm_term }, abv)
```

`AmberTrackVisita` não desenha nada. Ao montar, manda uma visita por carregamento de página e por
ponto, por `navigator.sendBeacon` (sem ele, `fetch` com `keepalive`). Disparo cego: nenhum erro sobe
para a tela.

`montarSck` lê o clique do cookie `_atk`:

- Hotmart: `utm_source|utm_medium|utm_campaign|utm_content|utm_term|abv_…|clk_…`. Sem `abv`, o sexto
  campo fica vazio; sem clique, o sétimo some. `|` e espaço saem dos valores. Acima de 255
  caracteres, encurta `utm_term`, depois `utm_content`, `utm_campaign`, `utm_medium` e `utm_source`;
  `abv_` e `clk_` nunca são cortados.
- Guru: `abv_…|clk_…`, ou só um dos dois. Nunca UTM.

## Como o envio funciona

- **2 s, no máximo.** Cada chamada à API tem `AbortSignal.timeout(2000)`. `capturarLead` nunca lança
  erro e nunca segura a página além disso.
- **Idempotência.** O pacote calcula uma chave por envio,
  `sha256(ponto | e-mail normalizado | dígitos do telefone | janela de 2 minutos)`, e a devolve à
  página como `leadRef`. A página não interpreta o valor: guarda e passa ao relato. É texto, então
  atravessa processo.
- **Reenvio tardio, nunca cancelado.** Fora do 200, a página entrega pelo caminho dela e o pacote, com
  `after()` do Next, manda o mesmo lead de novo 10 s depois, com a mesma chave e `reenvio: true` (até
  3 tentativas, 5 s entre elas). Se o primeiro envio tinha chegado e só a resposta se perdeu, a API
  devolve o lead que já existe: nada duplica.
- **Relato.** `relatarEntregaDaPagina` roda depois da resposta (`after()`). Com reenvio pendente do
  mesmo `leadRef` no processo, vai junto com ele (`entrega_pagina`). Senão, vai para
  `POST /api/track/v1/leads/entrega-pagina`; a Dash acha o lead pelo `leadRef` ou, sem ele, por
  ponto + e-mail (ou telefone) nos últimos 10 minutos. 404 → uma nova tentativa 30 s depois; de novo
  404 → desiste com um aviso sem dado pessoal.

## O que o pacote nunca faz

- Nunca manda tag, lista ou campanha como instrução.
- Nunca chama o ActiveCampaign.
- Nunca grava IP, nunca lê `localStorage`, nunca cria cookie de visitante (o `_abv` é do `proxy.ts`
  da página).
- Nunca depende de pacote de runtime: `dependencies` vazio.

## Contrato

`contrato/contrato-v1.json` é a cópia, byte a byte, do contrato da API v1 da Dash
(`lib/track/api-v1/contrato-v1.json`). `test/contrato.test.ts` confere que os corpos que o pacote
monta são os dos exemplos. Mudou num, muda no outro no mesmo par de PRs. Mudança que quebra o
contrato vira `/api/track/v2/`.

## Desenvolver

```bash
npm install
npm run build   # gera dist/ (commitado)
npm test        # tsc -p tsconfig.test.json && node --test
```

`exemplo/` é uma página Next mínima que usa o pacote como uma LP usaria, instalado pelo `.tgz` do
`npm pack`. Os roteiros do E2E local contra a Dash estão em [exemplo/e2e/LEIA.md](exemplo/e2e/LEIA.md).

Publicar uma versão: build, `dist/` commitado, `CHANGELOG.md` com a "Ação do consumidor" e a tag
`vX.Y.Z` no commit.
