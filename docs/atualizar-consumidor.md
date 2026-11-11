# Atualizar o pacote numa página consumidora

Runbook para subir uma página que já usa `@amber/track` de uma versão para outra.

**Antes de atualizar, leia a entrada da versão no [CHANGELOG](../CHANGELOG.md).** Se ela disser
_"Ação do consumidor: nenhuma"_, é só o procedimento abaixo: nada de código da página muda.

---

## O prompt curto

> Atualiza o `@amber/track` para **vX.Y.Z** seguindo o runbook em
> `github.com/grupo-amber-brazil/amber-track-pacote/blob/main/docs/atualizar-consumidor.md`

## O prompt completo (cole no chat do projeto)

> Atualize o pacote `@amber/track` para a versão **vX.Y.Z**.
>
> 1. No `package.json`, troque a tag da dependência para
>    `github:grupo-amber-brazil/amber-track-pacote#vX.Y.Z`.
> 2. Rode o install do gerenciador que este repositório usa (`npm install` ou `pnpm install`) para
>    **atualizar o lockfile**. Isso é obrigatório.
> 3. Rode o build do projeto para confirmar que nada quebrou.
> 4. Commite `package.json` **e** o lockfile juntos.
>
> Não altere nenhum outro código da página, a menos que o CHANGELOG da versão peça.

---

## Por que o passo 2 é obrigatório

O lockfile **guarda o commit**, não a tag. Se você editar só o `package.json` e commitar, o CI roda
`npm ci` (ou `pnpm install --frozen-lockfile`), lê o lock antigo e **instala a versão velha assim
mesmo**, ou falha por lock dessincronizado.

É o modo de falha silencioso clássico: **deploy verde, pacote antigo**. Se o comportamento novo não
aparecer depois do deploy, o lockfile é o primeiro lugar para olhar (procure `amber-track-pacote` no
lock e confira o commit).

Não é preciso buildar o pacote: o `dist/` é **commitado** no repositório dele.

## Verificar que subiu de verdade

O pacote manda a versão dele em todo request (`X-Amber-Track-Pacote`), e a Dash guarda
(`track_site_versions`). Depois do deploy, abra na Dash a tela **Integrações** (cartão "Páginas
(pacote Amber Track)") ou o site em questão: a versão nova tem de aparecer entre as usadas nos
últimos minutos. Se só a antiga aparece, confira o lockfile.

"A página continua funcionando" não prova nada: sem as envs, ou com a API fora, o pacote deixa a
página entregar como antes, de propósito.
