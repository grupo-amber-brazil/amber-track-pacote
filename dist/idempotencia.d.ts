/** Janela da chave de idempotência: 2 minutos. */
export declare const JANELA_MS = 120000;
/** `lower(trim(email))`, a mesma forma do `email_norm` da Dash. */
export declare const normalizarEmail: (email: string | undefined) => string;
/** Só os dígitos do telefone, como vieram (sem tirar o 55). */
export declare const digitosDoTelefone: (telefone: string | undefined) => string;
/**
 * `sha256(ponto | email_norm | dígitos do telefone | janela de 2 minutos)`, em hexadecimal
 * minúsculo (64 caracteres). Calculada uma vez por envio; o reenvio tardio usa a mesma, e ela
 * volta à página como `leadRef`. Nada recalcula a chave depois do envio: a Dash só confere o
 * formato e usa o valor como veio.
 */
export declare function calcularIdempotencia(ponto: string, contato: {
    email?: string;
    telefone?: string;
}, agoraMs: number): string;
