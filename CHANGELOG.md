# Changelog

Histórico de versões do `@amber/track`. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[SemVer](https://semver.org/lang/pt-BR/): em `0.x`, mudança de comportamento sobe o **minor**.

O pacote é instalado **por tag git**, então cada versão aqui corresponde a uma tag no repositório. A
linha que importa para quem consome é **"Ação do consumidor"**: se for _nenhuma_, atualizar é só
trocar a tag e rodar o install (ver [docs/atualizar-consumidor.md](docs/atualizar-consumidor.md)).

---

## [0.1.0] — não publicada

A tag `v0.1.0` sai depois do E2E local e da promoção da Dash para a `main`, com
`contrato/contrato-v1.json` igual, byte a byte, ao da Dash promovida.

**Ação do consumidor: instalação nova.** Instalar o pacote, pôr `AMBER_TRACK_URL` e
`AMBER_TRACK_SITE_SECRET` no servidor da página (o segredo no cofre de infra, antes de a task def
referenciá-lo), e ligar as quatro peças: `comAmberTrack` no `proxy.ts`, `capturarLead` e
`relatarEntregaDaPagina` na rota de captura, `<AmberTrackVisita ponto="pc_…" />` na página e
`montarSck` no link do checkout. Sem as envs, nada muda na página.

### Adicionado

- `@amber/track/proxy`: `comAmberTrack` grava o cookie `_atk` do clique no servidor (30 dias,
  `Secure`, `SameSite=Lax`).
- `@amber/track/server`: `capturarLead` manda o lead à API v1 com limite de 2 s e devolve quem
  entrega ao ActiveCampaign; fora do 200, reenvio tardio pela mesma chave, que nunca é cancelado.
  `relatarEntregaDaPagina` relata o caminho da página, pegando carona no reenvio pendente ou pela
  rota própria, com uma nova tentativa no 404.
- `@amber/track/client`: `AmberTrackVisita` manda uma visita por carregamento; `montarSck` monta o
  `sck` da Hotmart e da Guru com `abv_` e `clk_`.
- `@amber/track`: os tipos (`EntradaLead`, `ResultadoLead`, `RelatoDaPagina`, `Utms`, corpos da API).
- `contrato/contrato-v1.json` e os testes do pacote.
- `exemplo/`: página Next 16.4.3 com o pacote pelo `.tgz` e os roteiros do E2E local.
