-- Uma linha por visita. Não guarda IP, user agent nem nada que identifique a pessoa.
CREATE TABLE visita (
  id        INTEGER PRIMARY KEY,
  criada_em INTEGER NOT NULL, -- epoch em milissegundos, UTC
  caminho   TEXT    NOT NULL,
  origem    TEXT    NOT NULL, -- linkedin | google | github | direto | domínio de onde veio
  pais      TEXT              -- ISO 3166-1 alfa-2 informado pela Cloudflare, ou NULL
);

CREATE INDEX visita_criada_em ON visita (criada_em);
