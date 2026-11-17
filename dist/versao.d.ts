/**
 * Versão do pacote e da API que ele fala. Vão em todo request, nos cabeçalhos
 * `X-Amber-Track-Pacote` e `X-Amber-Track-Api`, e no corpo da visita (`pacote` e `v`).
 * A Dash grava as duas em `track_site_versions`, e a tela Integrações mostra a versão
 * que cada site usa. `test/pacote.test.ts` confere que esta constante é igual ao
 * `version` do `package.json`.
 */
export declare const VERSAO_DO_PACOTE = "0.1.0";
/** Versão da API do Amber Track: `/api/track/v1/`. */
export declare const VERSAO_DA_API = 1;
/** Endereço público da API, usado pela visita quando `NEXT_PUBLIC_AMBER_TRACK_URL` não existe. */
export declare const ENDERECO_PADRAO = "https://dash.grupoamber.com.br";
