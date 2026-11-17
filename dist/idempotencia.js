import { createHash } from "node:crypto";
/** Janela da chave de idempotência: 2 minutos. */
export const JANELA_MS = 120_000;
/** `lower(trim(email))`, a mesma forma do `email_norm` da Dash. */
export const normalizarEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : "";
/** Só os dígitos do telefone, como vieram (sem tirar o 55). */
export const digitosDoTelefone = (telefone) => typeof telefone === "string" ? telefone.replace(/\D/g, "") : "";
/**
 * `sha256(ponto | email_norm | dígitos do telefone | janela de 2 minutos)`, em hexadecimal
 * minúsculo (64 caracteres). Calculada uma vez por envio; o reenvio tardio usa a mesma, e ela
 * volta à página como `leadRef`. Nada recalcula a chave depois do envio: a Dash só confere o
 * formato e usa o valor como veio.
 */
export function calcularIdempotencia(ponto, contato, agoraMs) {
    const janela = Math.floor(agoraMs / JANELA_MS);
    const base = [ponto, normalizarEmail(contato.email), digitosDoTelefone(contato.telefone), String(janela)].join("|");
    return createHash("sha256").update(base, "utf8").digest("hex");
}
