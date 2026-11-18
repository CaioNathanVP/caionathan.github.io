import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migracoes = await readD1Migrations("./migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Valores fixos nos testes, mesmo que exista um .dev.vars local.
          bindings: {
            ORIGEM_SITE: "https://caionathanvp.github.io",
            CHAVE_PAINEL: "chave-de-teste",
            MIGRACOES: migracoes,
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/aplicar-migracoes.ts"] },
  };
});
