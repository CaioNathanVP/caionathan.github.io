import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker, { type Ambiente } from "../src/index";

const SITE = "https://caionathanvp.github.io";
const API = "https://contador.exemplo";
const FUSO_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const ambiente = env as unknown as Ambiente;

function visitar(corpo: unknown, init: RequestInit & { cf?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", SITE);
  headers.set("Content-Type", "text/plain");
  return worker.fetch(new Request(`${API}/v`, { ...init, method: "POST", headers, body: JSON.stringify(corpo) }), ambiente);
}

function pedirEstatisticas(consulta = "", chave: string | null = "chave-de-teste") {
  const headers = new Headers({ Origin: SITE });
  if (chave !== null) headers.set("Authorization", `Bearer ${chave}`);
  return worker.fetch(new Request(`${API}/estatisticas${consulta}`, { headers }), ambiente);
}

async function linhas() {
  const { results } = await env.DB.prepare("SELECT caminho, origem, pais FROM visita ORDER BY id").all();
  return results;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM visita").run();
});

describe("POST /v", () => {
  it("grava a visita vinda do portfólio", async () => {
    const res = await visitar({ p: "/caionathan.github.io/", r: "https://www.linkedin.com/" }, { cf: { country: "BR" } });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await linhas()).toEqual([{ caminho: "/caionathan.github.io/", origem: "linkedin", pais: "BR" }]);
  });

  it("recusa outra origem", async () => {
    const res = await visitar({ p: "/" }, { headers: { Origin: "https://site-qualquer.com" } });

    expect(res.status).toBe(403);
    expect(await linhas()).toEqual([]);
  });

  it("ignora robôs sem gravar", async () => {
    const res = await visitar({ p: "/" }, { headers: { "User-Agent": "Googlebot/2.1" } });

    expect(res.status).toBe(204);
    expect(await linhas()).toEqual([]);
  });

  it("corrige caminho inválido e recusa corpo que não é JSON", async () => {
    await visitar({ p: "javascript:alert(1)", r: 42 });
    expect(await linhas()).toEqual([{ caminho: "/", origem: "direto", pais: null }]);

    const res = await worker.fetch(
      new Request(`${API}/v`, { method: "POST", headers: { Origin: SITE }, body: "{quebrado" }),
      ambiente,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /estatisticas", () => {
  it("exige a chave", async () => {
    expect((await pedirEstatisticas("", null)).status).toBe(401);
    expect((await pedirEstatisticas("", "errada")).status).toBe(401);
  });

  it("agrupa por dia e hora no horário de Brasília", async () => {
    const hoje = Math.floor((Date.now() - FUSO_MS) / DIA_MS);
    const ontem = hoje - 1;
    // 01:00 UTC de hoje = 22:00 de ontem em Brasília.
    const ontemAs22 = hoje * DIA_MS + 60 * 60 * 1000;
    const foraDoPeriodo = (hoje - 7) * DIA_MS + FUSO_MS + 60 * 60 * 1000;

    const inserir = env.DB.prepare("INSERT INTO visita (criada_em, caminho, origem, pais) VALUES (?, '/', ?, ?)");
    await env.DB.batch([
      inserir.bind(ontemAs22, "linkedin", "BR"),
      inserir.bind(ontemAs22, "linkedin", "PT"),
      inserir.bind(ontemAs22, "google", "BR"),
      inserir.bind(foraDoPeriodo, "github", "US"),
    ]);

    const res = await pedirEstatisticas("?dias=7");
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      dias: number;
      total: number;
      porDia: { dia: string; visitas: number }[];
      porHora: number[];
      origens: { origem: string; visitas: number }[];
      paises: { pais: string; visitas: number }[];
    };

    const diaDeOntem = new Date(ontem * DIA_MS).toISOString().slice(0, 10);
    expect(corpo.dias).toBe(7);
    expect(corpo.total).toBe(3);
    expect(corpo.porDia).toHaveLength(7);
    expect(corpo.porDia.find((d) => d.dia === diaDeOntem)?.visitas).toBe(3);
    expect(corpo.porHora[22]).toBe(3);
    expect(corpo.porHora.reduce((a, b) => a + b, 0)).toBe(3);
    expect(corpo.origens).toEqual([
      { origem: "linkedin", visitas: 2 },
      { origem: "google", visitas: 1 },
    ]);
    expect(corpo.paises).toEqual([
      { pais: "BR", visitas: 2 },
      { pais: "PT", visitas: 1 },
    ]);
  });

  it("usa 30 dias quando o período pedido não existe", async () => {
    const corpo = (await (await pedirEstatisticas("?dias=1000")).json()) as { dias: number; porDia: unknown[] };
    expect(corpo.dias).toBe(30);
    expect(corpo.porDia).toHaveLength(30);
  });
});

describe("rotas", () => {
  it("responde 404 para o resto", async () => {
    expect((await worker.fetch(new Request(`${API}/`), ambiente)).status).toBe(404);
  });

  it("libera o preflight só para o portfólio", async () => {
    const ok = await worker.fetch(new Request(`${API}/estatisticas`, { method: "OPTIONS", headers: { Origin: SITE } }), ambiente);
    const outro = await worker.fetch(new Request(`${API}/estatisticas`, { method: "OPTIONS", headers: { Origin: "https://x.com" } }), ambiente);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(outro.status).toBe(403);
  });
});
