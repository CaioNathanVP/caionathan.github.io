import { describe, expect, it } from "vitest";
import { classificarOrigem } from "../src/origem";

const SITE = "https://caionathanvp.github.io";

describe("classificarOrigem", () => {
  it.each([
    ["", "direto"],
    ["não é url", "direto"],
    [`${SITE}/caionathan.github.io/`, "direto"],
    ["https://www.linkedin.com/", "linkedin"],
    ["https://br.linkedin.com/in/alguem", "linkedin"],
    ["https://lnkd.in/abc", "linkedin"],
    ["android-app://com.linkedin.android/", "linkedin"],
    ["https://www.google.com/", "google"],
    ["https://www.google.com.br/", "google"],
    ["android-app://com.google.android.googlequicksearchbox/", "google"],
    ["https://github.com/CaioNathanVP", "github"],
    ["https://outra-pessoa.github.io/", "outra-pessoa.github.io"],
    ["https://www.bing.com/search?q=caio", "bing.com"],
  ])("%s → %s", (referrer, esperado) => {
    expect(classificarOrigem(referrer, SITE)).toBe(esperado);
  });
});
