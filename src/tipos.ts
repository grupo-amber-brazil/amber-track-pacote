/**
 * Tipos públicos do `@amber/track`. São a fonte para quem implementa a página: o TypeScript
 * recusa campo que não existe. Repare no que NÃO existe aqui: tag, lista e campanha. Quem
 * escolhe tag, lista e campanha é o ponto de captura, na Dash; a página nunca manda isso como
 * instrução. O relato (`RelatoDaPagina`) leva as tags e a lista que a página aplicou só como
 * dado informado.
 */

/** O que a rota de captura da página passa a `capturarLead`. */
export type EntradaLead = {
  /** Chave pública do ponto de captura: `pc_` + 16 símbolos. */
  ponto: string;
  /** E-mail ou telefone é obrigatório; sem os dois a API recusa (422 `SEM_CONTATO`). */
  contato: { nome?: string; email?: string; telefone?: string };
  /**
   * Respostas do formulário. Chave `^[a-z][a-z0-9_]{0,39}$`, valor texto. `tag`, `tags`,
   * `lista`, `list` e as chaves de `marcas` são recusadas pela API (422 `CAMPO_PROIBIDO`).
   */
  campos?: Record<string, string>;
  /** Marcas da visita. `atk`, se vier, vence o cookie `_atk`. */
  marcas?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    fbclid?: string;
    fbp?: string;
    pagina?: string;
    /** Só o host de onde a pessoa veio (ex.: `l.instagram.com`). Opcional. */
    referrer_host?: string;
    atk?: string;
  };
};

/** Por que `capturarLead` devolveu o que devolveu. */
export type MotivoDoResultado =
  | "modo_pagina"
  | "track_entrega"
  | "tempo_esgotado"
  | "recusado"
  | "sem_configuracao";

/** O que `capturarLead` devolve. Nunca lança erro. */
export type ResultadoLead = {
  /** `true` só quando a API respondeu 200. */
  registrado: boolean;
  /** Id do lead na Dash, quando a API respondeu 200. */
  leadId: string | null;
  /**
   * Referência opaca do envio. A página guarda e passa a `relatarEntregaDaPagina`; não
   * interpreta o valor. É texto: atravessa processo. `null` só sem configuração.
   */
  leadRef: string | null;
  /** `true`: a página faz o caminho dela até o ActiveCampaign, como hoje, e relata depois. */
  entregaPelaPagina: boolean;
  motivo: MotivoDoResultado;
};

/** O que a página relata depois de fazer o caminho dela. */
export type RelatoDaPagina = {
  /** O `leadRef` de `ResultadoLead`; `null` quando a página não o tem. */
  leadRef: string | null;
  ponto: string;
  /** Para a busca de reserva do servidor (ponto + e-mail, ou telefone, nos últimos 10 minutos). */
  contato: { email?: string; telefone?: string };
  resultado: "ok" | "pendente" | "erro";
  /** Tags que a página aplicou: o nome, ou `#<id>` quando a rota configura a tag por id. Até 20. */
  tags: string[];
  /** Lista em que a página inscreveu, ou `null`. */
  lista: number | null;
  /**
   * Até 200 caracteres, sem dado pessoal. O servidor mascara e-mail e telefone mesmo assim.
   */
  detalhe?: string;
};

/** UTMs que entram no `sck` do checkout. */
export type Utms = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

/** Gateways cujo `sck` o pacote sabe montar. */
export type GatewayDoSck = "hotmart" | "guru";

/** Corpo de `POST /api/track/v1/eventos`, mandado pelo navegador (`AmberTrackVisita`). */
export type CorpoVisita = {
  v: 1;
  pacote: string;
  ponto: string;
  tipo: "visita";
  caminho: string;
  atk?: string;
  abv?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
};

/** O relato como vai dentro do reenvio tardio (`entrega_pagina` do corpo do lead). */
export type CorpoEntregaPagina = {
  resultado: "ok" | "pendente" | "erro";
  tags: string[];
  lista: number | null;
  detalhe?: string;
};

/** Corpo de `POST /api/track/v1/leads`, mandado pelo servidor da página. */
export type CorpoLead = {
  ponto: string;
  idempotencia: string;
  contato: { nome?: string; email?: string; telefone?: string };
  campos?: Record<string, string>;
  marcas?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    fbclid?: string;
    fbp?: string;
    pagina?: string;
    referrer_host?: string;
    atk?: string;
    abv?: string;
  };
  reenvio?: true;
  entrega_pagina?: CorpoEntregaPagina;
};

/** Corpo de `POST /api/track/v1/leads/entrega-pagina`. */
export type CorpoRelato = {
  ponto: string;
  lead_ref?: string;
  contato: { email?: string; telefone?: string };
  resultado: "ok" | "pendente" | "erro";
  tags: string[];
  lista: number | null;
  detalhe?: string;
};

/** Resposta 200 de `POST /api/track/v1/leads`. */
export type RespostaLead = {
  lead: string;
  novo: boolean;
  entrega: "pagina" | "track";
};
