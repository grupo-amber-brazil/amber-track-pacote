"use client";

import { useState, type FormEvent } from "react";

const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function Formulario() {
  const [estado, setEstado] = useState<string>("");

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    const query = new URLSearchParams(window.location.search);
    for (const utm of UTMS) {
      const valor = query.get(utm);
      if (valor) dados[utm] = valor;
    }
    dados.pagina = window.location.pathname;
    setEstado("enviando…");
    const inicio = performance.now();
    try {
      const resposta = await fetch("/api/captura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const corpo = await resposta.json();
      const ms = Math.round(performance.now() - inicio);
      setEstado(`inscrição feita em ${ms} ms: ${JSON.stringify(corpo)}`);
    } catch {
      setEstado("falhou");
    }
  }

  return (
    <form method="post" action="/api/captura" onSubmit={enviar} style={{ display: "grid", gap: 8 }}>
      <label>
        Nome <input name="nome" autoComplete="name" />
      </label>
      <label>
        E-mail <input name="email" type="email" autoComplete="email" />
      </label>
      <label>
        Telefone <input name="telefone" type="tel" autoComplete="tel" />
      </label>
      <label>
        Objetivo <input name="objetivo" />
      </label>
      <button type="submit">Quero</button>
      <output id="estado">{estado}</output>
    </form>
  );
}
