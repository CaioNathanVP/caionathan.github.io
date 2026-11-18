import { classificarOrigem } from "./origem";

export interface Ambiente {
  DB: D1Database;
  /** Origem do portfólio, sem barra no fim. Ex.: https://caionathanvp.github.io */
  ORIGEM_SITE: string;
  /** Chave do painel. Segredo: "wrangler secret put CHAVE_PAINEL". */
  CHAVE_PAINEL: string;
}

/** Brasília está em UTC-3 o ano todo desde 2019 (sem horário de verão). */
const FUSO_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const PERIODOS = [7, 30, 90] as const;
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|python|curl|wget|httpclient/i;

export default {
  async fetch(req: Request, env: Ambiente): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return preflight(req, env);
    if (req.method === "POST" && url.pathname === "/v") return registrarVisita(req, env);
    if (req.method === "GET" && url.pathname === "/estatisticas") return estatisticas(req, url, env);

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Ambiente>;

/* ------------------------------------------------------------ */
/* POST /v                                                      */
/* ------------------------------------------------------------ */

async function registrarVisita(req: Request, env: Ambiente): Promise<Response> {
  if (req.headers.get("Origin") !== env.ORIGEM_SITE) {
    return new Response(null, { status: 403 });
  }

  const cabecalhos = cors(req, env);
  if (ROBO.test(req.headers.get("User-Agent") ?? "")) {
    return new Response(null, { status: 204, headers: cabecalhos });
  }

  const texto = await req.text();
  if (texto.length > 2000) return new Response(null, { status: 413, headers: cabecalhos });

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return new Response(null, { status: 400, headers: cabecalhos });
  }

  const dados = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const caminho = typeof dados.p === "string" && dados.p.startsWith("/") ? dados.p.slice(0, 200) : "/";
  const referrer = typeof dados.r === "string" ? dados.r.slice(0, 500) : "";
  const pais = typeof req.cf?.country === "string" ? req.cf.country.slice(0, 2) : null;

  await env.DB.prepare("INSERT INTO visita (criada_em, caminho, origem, pais) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), caminho, classificarOrigem(referrer, env.ORIGEM_SITE), pais)
    .run();

  return new Response(null, { status: 204, headers: cabecalhos });
}

/* ------------------------------------------------------------ */
/* GET /estatisticas                                            */
/* ------------------------------------------------------------ */

interface Contagem { visitas: number }

async function estatisticas(req: Request, url: URL, env: Ambiente): Promise<Response> {
  const cabecalhos = cors(req, env);

  const autorizacao = req.headers.get("Authorization") ?? "";
  const chave = autorizacao.startsWith("Bearer ") ? autorizacao.slice(7) : "";
  if (!env.CHAVE_PAINEL || !(await iguais(chave, env.CHAVE_PAINEL))) {
    return json({ erro: "chave_invalida" }, 401, cabecalhos);
  }

  const pedido = Number(url.searchParams.get("dias"));
  const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 30;

  // O período termina hoje e começa à meia-noite de Brasília de (dias - 1) dias atrás.
  const hoje = Math.floor((Date.now() - FUSO_MS) / DIA_MS);
  const primeiroDia = hoje - (dias - 1);
  const inicio = primeiroDia * DIA_MS + FUSO_MS;

  const local = "(criada_em / 1000) - 10800, 'unixepoch'";
  const [porDia, porHora, origens, paises] = await env.DB.batch([
    env.DB.prepare(`SELECT date(${local}) AS dia, COUNT(*) AS visitas FROM visita WHERE criada_em >= ? GROUP BY dia`).bind(inicio),
    env.DB.prepare(`SELECT CAST(strftime('%H', ${local}) AS INTEGER) AS hora, COUNT(*) AS visitas FROM visita WHERE criada_em >= ? GROUP BY hora`).bind(inicio),
    env.DB.prepare("SELECT origem, COUNT(*) AS visitas FROM visita WHERE criada_em >= ? GROUP BY origem ORDER BY visitas DESC, origem LIMIT 10").bind(inicio),
    env.DB.prepare("SELECT COALESCE(pais, '??') AS pais, COUNT(*) AS visitas FROM visita WHERE criada_em >= ? GROUP BY pais ORDER BY visitas DESC, pais LIMIT 10").bind(inicio),
  ]);

  const visitasPorDia = new Map((porDia!.results as (Contagem & { dia: string })[]).map((l) => [l.dia, l.visitas]));
  const serieDias = [];
  for (let d = primeiroDia; d <= hoje; d++) {
    const dia = new Date(d * DIA_MS).toISOString().slice(0, 10);
    serieDias.push({ dia, visitas: visitasPorDia.get(dia) ?? 0 });
  }

  const serieHoras: number[] = Array.from({ length: 24 }, () => 0);
  for (const linha of porHora!.results as (Contagem & { hora: number })[]) serieHoras[linha.hora] = linha.visitas;

  return json(
    {
      dias,
      total: serieDias.reduce((soma, d) => soma + d.visitas, 0),
      porDia: serieDias,
      porHora: serieHoras,
      origens: origens!.results,
      paises: paises!.results,
    },
    200,
    cabecalhos,
  );
}

/* ------------------------------------------------------------ */
/* Apoio                                                        */
/* ------------------------------------------------------------ */

/** Compara as chaves em tempo constante, pelo hash, para não vazar o tamanho nem o conteúdo. */
async function iguais(a: string, b: string): Promise<boolean> {
  const codificador = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", codificador.encode(a)),
    crypto.subtle.digest("SHA-256", codificador.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function cors(req: Request, env: Ambiente): Headers {
  const cabecalhos = new Headers({ Vary: "Origin" });
  if (req.headers.get("Origin") === env.ORIGEM_SITE) {
    cabecalhos.set("Access-Control-Allow-Origin", env.ORIGEM_SITE);
  }
  return cabecalhos;
}

function preflight(req: Request, env: Ambiente): Response {
  const cabecalhos = cors(req, env);
  if (!cabecalhos.has("Access-Control-Allow-Origin")) return new Response(null, { status: 403 });
  cabecalhos.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  cabecalhos.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  cabecalhos.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers: cabecalhos });
}

function json(corpo: unknown, status: number, cabecalhos: Headers): Response {
  cabecalhos.set("Content-Type", "application/json; charset=utf-8");
  cabecalhos.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
}
