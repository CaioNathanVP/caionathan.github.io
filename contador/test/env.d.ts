declare namespace Cloudflare {
  interface Env {
    ORIGEM_SITE: string;
    CHAVE_PAINEL: string;
    MIGRACOES: import("cloudflare:test").D1Migration[];
  }
}
