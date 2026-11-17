import type { ReactNode } from "react";

export const metadata = { title: "Exemplo @amber/track" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
        {children}
      </body>
    </html>
  );
}
