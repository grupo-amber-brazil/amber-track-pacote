# E2E local do `@amber/track` (03 §10 da spec #95)

A prova de "pronto para instalar": o exemplo, com o pacote instalado pelo `.tgz`, contra a Dash
**local** da branch, com as frentes F1, F2 e F3 integradas, antes da promoção da Dash para a `main`.
O ActiveCampaign é **simulado** por interceptador de `fetch` (`ac-simulado.mjs`): nada chega ao AC de
verdade, e cada chamada vira uma linha em `e2e/saida/ac-simulado.jsonl`.

Os scripts só **leem** o banco: abrem a sessão em modo somente leitura e recusam host que não seja
`localhost`. Mesmo assim, rode com Postgres e Redis **descartáveis** e qualquer túnel para banco de
produção **fechado**: um túnel escutando na mesma porta local faria o script (e a Dash local) falar
com o banco errado.

## Preparar (uma vez)

1. **Dash local** da branch integrada, com Postgres e Redis descartáveis e as migrations aplicadas.
   Suba o **web** e o **worker**. Para os dois carregarem o AC simulado, use o mesmo log e controle do
   exemplo (caminhos absolutos) e a URL do arquivo do interceptador:

   ```bash
   # no shell de cada processo da Dash, antes de subi-lo
   export AC_SIMULADO_LOG=<pasta do exemplo>/e2e/saida/ac-simulado.jsonl
   export AC_SIMULADO_CONTROLE=<pasta do exemplo>/e2e/saida/ac-simulado-controle.json
   export AC_SIMULADO_ORIGEM=dash-worker      # dash-web no processo web
   export NODE_OPTIONS="--import file:///<pasta do exemplo>/e2e/ac-simulado.mjs"
   export ACTIVE_CAMPAIGN_BASE_URL=https://exemplo-e2e.api-us1.com
   export ACTIVE_CAMPAIGN_API_TOKEN=token-ficticio
   ```

   O interceptador responde a qualquer `*.api-us1.com` e `*.activehosted.com`: mesmo com uma conta
   de verdade na env, a chamada não sai da máquina. Ele simula `contact/sync`, `contactTags`,
   `contactLists`, `tags`, `lists`, `fields` e `fieldValues` (ids estáveis por e-mail e por tag);
   confira contra a porta do AC da F2 (`lib/track/ports/activecampaign.ts`) se ela usa outro caminho.
2. Na Dash local: crie um **site** com a origem `http://localhost:3100` (anote o segredo `ats_`,
   mostrado uma vez), um **ponto** "Pela página" com tags e lista (anote a chave `pc_`), e um **link**
   da campanha do ponto. Abra o link uma vez para gerar um **clique**; anote o `clk_` dele
   (`track_clicks.code`).
3. No exemplo:

   ```bash
   cd exemplo
   npm run pacote            # build do pacote, npm pack e install do .tgz no exemplo
   cp .env.example .env.local
   # preencha: AMBER_TRACK_SITE_SECRET, AMBER_TRACK_PONTO, E2E_CLIQUE, E2E_DATABASE_URL,
   # EXEMPLO_TAGS e EXEMPLO_LISTA iguais às do ponto
   ```

4. Três terminais, a partir de `exemplo/`:

   ```bash
   npm run e2e:rele          # relé 3999 → Dash local (o roteiro 4 o desliga e religa)
   npm run dev:e2e           # exemplo em http://localhost:3100 com o AC simulado (origem "exemplo")
   ```

Navegador: Chromium (Chrome ou Edge), que aceita cookie `Secure` em `http://localhost`
(assumido, não verificado; o roteiro 1 mostra). Safari fica fora.

## Roteiros (um comando cada)

| # | Comando | Antes | O que confere |
|---|---|---|---|
| 1 | `npm run e2e:1` | abra no Chromium `http://localhost:3100/?atk=<E2E_CLIQUE>&utm_source=e2e` **uma vez** | `Set-Cookie: _atk=<clk>` com `Max-Age=2592000`, `Secure`, `SameSite=Lax`, sem `HttpOnly`/`Domain`; `track_clicks.code = <clk>` existe; **uma** linha `track_click_events` com `kind='visit'`, o ponto, `click_code = <clk>`, `click_id` do clique, `visitor_id` = um `abv_` e `package_version = '0.1.0'`; `track_click_visitors` com `(click_id, visitor_id)` igual ao da visita e `source = 'pacote_visita'` |
| 2 | `npm run e2e:2` | ponto "Pela página" | resposta do exemplo `entrega: "pagina"`, `motivo: "modo_pagina"`, `ac: "ok"`; `track_leads` do e-mail com `ac_mode='page'`, `ac_status='page_ok'`, `click_code`/`click_id` do clique, `visitor_id` = o `abv_` mandado, `utm_source='e2e'`, `utm_medium='roteiro-2'`, `utm_campaign='pela-pagina'`, `ac_page_report.resultado='ok'`, `package_version='0.1.0'`, `api_version=1`; no log do AC, o `contact/sync` de origem `exemplo` e **nenhuma** chamada de origem `dash-*` para esse contato |
| 3 | `npm run e2e:3` | `TRACK_AC_DELIVERY_ENABLED=true` no web e no worker; ponto passado para "Pelo Amber Track" | parte A: resposta `entrega: "track"`; nenhuma chamada do exemplo ao AC; `track_leads.ac_mode='track'` e `ac_status='delivered'`; chamadas do `dash-worker` na ordem `contact/sync` → `contactTags` (extras, principal por último) → `contactLists`, cada uma uma vez. Parte B: o script injeta 503 na primeira `contactLists`; o lead chega a `delivered` e `ac_list_done=true`, e depois do 503 o worker chama **só** `contactLists` (espera até 120 s) |
| 4 | `npm run e2e:4` | ponto de volta a "Pela página"; relé no ar | o script desliga o relé (para o exemplo, a Dash está fora: conexão recusada) e manda o formulário: resposta `entrega: "pagina"` com `motivo` `recusado` ou `tempo_esgotado` em menos de 3,5 s, e o caminho simulado chamou o AC simulado; religa o relé 5 s depois; o lead aparece (criado pelo reenvio tardio, ~10 s) com `ac_mode='page'`, `ac_status='page_ok'` e `ac_page_report.resultado='ok'` (o relato foi junto, em `entrega_pagina`, pelo `after()` do Next 16.4.3) |
| 5 | `npm run e2e:5 -- "<sck>"` | no mesmo Chromium do roteiro 1, abra `http://localhost:3100/?utm_source=instagram&utm_medium=stories&utm_campaign=black` e copie o texto de "sck:" | 7 campos; o 7º é o `E2E_CLIQUE`; o 6º é um `abv_` e é o `visitor_id` da visita do roteiro 1 em `track_click_events`; as três UTMs nos três primeiros; até 255 caracteres |

Cada script imprime `ok` ou `FALHOU` por conferência e termina com código 0 (passou), 1 (alguma
conferência falhou) ou 2 (faltou preparar algo). O resultado e o log do AC simulado de cada roteiro
(`e2e/saida/ac-simulado.jsonl`) vão na descrição da PR da Dash, antes da promoção.

## O que o E2E também mostra

- Se `process.env.NEXT_PUBLIC_AMBER_TRACK_URL` é trocado pelo valor dentro do pacote em
  `node_modules`: se não for, a visita do roteiro 1 vai para o endereço de produção, não para a Dash
  local, e a conferência da visita falha. Olhe a aba Network do Chromium (`/api/track/v1/eventos`).
- Se o `after()` do Next 16.4.3 roda o reenvio e o relato depois da resposta (roteiro 4).
