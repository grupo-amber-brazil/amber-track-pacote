"use client";

import { useEffect, useState } from "react";
import { montarSck } from "@amber/track/client";

/** Link de checkout fictício: o produto não existe. O que importa é o `sck`. */
const CHECKOUT = "https://pay.hotmart.com/X00000000X";

function lerCookie(nome: string): string | null {
  for (const parte of document.cookie.split(";")) {
    const [chave, ...resto] = parte.trim().split("=");
    if (chave === nome) return decodeURIComponent(resto.join("="));
  }
  return null;
}

export function Checkout() {
  const [sck, setSck] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const utms = {
      utm_source: q.get("utm_source"),
      utm_medium: q.get("utm_medium"),
      utm_campaign: q.get("utm_campaign"),
      utm_content: q.get("utm_content"),
      utm_term: q.get("utm_term"),
    };
    setSck(montarSck("hotmart", utms, lerCookie("_abv")));
  }, []);

  if (!sck) return null;
  const href = `${CHECKOUT}?sck=${encodeURIComponent(sck)}`;
  return (
    <section style={{ marginTop: 24 }}>
      <a href={href} id="checkout">
        Checkout Hotmart (fictício)
      </a>
      <p>
        sck: <code id="sck">{sck}</code>
      </p>
    </section>
  );
}
