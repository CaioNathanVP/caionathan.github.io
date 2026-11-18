/**
 * Transforma o referrer de uma visita num rótulo curto para o painel.
 * Guarda só o domínio, nunca o endereço completo.
 */
export function classificarOrigem(referrer: string, origemSite: string): string {
  if (!referrer) return "direto";

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "direto";
  }

  if (url.origin === origemSite) return "direto";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return "direto";

  if (host === "lnkd.in" || /(^|\.)linkedin\.com$/.test(host) || host.startsWith("com.linkedin.")) {
    return "linkedin";
  }
  if (/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) || host.startsWith("com.google.")) {
    return "google";
  }
  if (host === "github.com" || host.endsWith(".github.com")) {
    return "github";
  }
  return host;
}
