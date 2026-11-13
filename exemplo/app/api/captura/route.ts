import { capturarLead, relatarEntregaDaPagina } from "@amber/track/server";

type Dados = Record<string, string | undefined>;

async function lerDados(request: Request): Promise<Dados> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return (await request.json()) as Dados;
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

/**
 * O "caminho da página" simulado: o que uma LP faz hoje até o ActiveCampaign (contato, tags,
 * lista). Aqui ele chama o AC SIMULADO do E2E (`e2e/ac-simulado.mjs`), nunca o de verdade: sem o
 * interceptador carregado no processo, não chama nada e relata `erro`.
 */
async function caminhoDaPagina(contato: { nome?: string; email?: string; telefone?: string }) {
  const tags = (process.env.EXEMPLO_TAGS ?? "[Exemplo] Lead").split(",").map((t) => t.trim()).filter(Boolean);
  const lista = process.env.EXEMPLO_LISTA ? Number(process.env.EXEMPLO_LISTA) : null;
  const simulado = (globalThis as { __amberAcSimulado?: boolean }).__amberAcSimulado === true;
  if (!simulado) {
    return { resultado: "erro" as const, tags: [], lista: null, detalhe: "AC simulado ausente: nada foi chamado" };
  }
  const base = (process.env.AC_BASE_URL ?? "https://exemplo-e2e.api-us1.com").replace(/\/+$/, "");
  const cabecalhos = { "Content-Type": "application/json", "Api-Token": "token-ficticio-do-exemplo" };
  try {
    const sync = await fetch(`${base}/api/3/contact/sync`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ contact: { email: contato.email, firstName: contato.nome, phone: contato.telefone } }),
    });
    if (!sync.ok) return { resultado: "erro" as const, tags: [], lista: null, detalhe: `AC ${sync.status} no contact/sync` };
    const contactId = ((await sync.json()) as { contact?: { id?: string } }).contact?.id;
    const aplicadas: string[] = [];
    for (const tag of tags) {
      const r = await fetch(`${base}/api/3/contactTags`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({ contactTag: { contact: contactId, tag } }),
      });
      if (!r.ok) return { resultado: "pendente" as const, tags: aplicadas, lista: null, detalhe: `AC ${r.status} no contactTags` };
      aplicadas.push(tag);
    }
    if (lista !== null) {
      const r = await fetch(`${base}/api/3/contactLists`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({ contactList: { list: lista, contact: contactId, status: 1 } }),
      });
      if (!r.ok) return { resultado: "pendente" as const, tags: aplicadas, lista: null, detalhe: `AC ${r.status} no contactLists` };
    }
    return { resultado: "ok" as const, tags: aplicadas, lista };
  } catch {
    return { resultado: "erro" as const, tags: [], lista: null, detalhe: "AC simulado não respondeu" };
  }
}

export async function POST(request: Request) {
  const dados = await lerDados(request);
  const ponto = process.env.AMBER_TRACK_PONTO ?? "";
  const contato = { nome: dados.nome, email: dados.email, telefone: dados.telefone };
  const marcas = {
    utm_source: dados.utm_source,
    utm_medium: dados.utm_medium,
    utm_campaign: dados.utm_campaign,
    utm_content: dados.utm_content,
    utm_term: dados.utm_term,
    pagina: dados.pagina,
  };

  const r = await capturarLead(request, {
    ponto,
    contato,
    campos: dados.objetivo ? { objetivo: dados.objetivo } : undefined,
    marcas,
  });

  if (!r.entregaPelaPagina) {
    // O Amber Track entrega: a página não chama o ActiveCampaign.
    return Response.json({ ok: true, entrega: "track", motivo: r.motivo, lead: r.leadId });
  }

  // A página entrega pelo caminho dela, como hoje, e relata ao Track.
  const ac = await caminhoDaPagina(contato);
  await relatarEntregaDaPagina({
    leadRef: r.leadRef,
    ponto,
    contato: { email: contato.email, telefone: contato.telefone },
    resultado: ac.resultado,
    tags: ac.tags,
    lista: ac.lista,
    detalhe: ac.detalhe,
  });
  return Response.json({ ok: true, entrega: "pagina", motivo: r.motivo, lead: r.leadId, ac: ac.resultado });
}
