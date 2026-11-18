// Painel de visitas: pede a chave, busca /estatisticas no Worker e desenha os gráficos.
(() => {
  // Endereço do Worker publicado (o mesmo de contador.js).
  const URL_PRODUCAO = 'https://portfolio-contador.portfolio-contador.workers.dev';

  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const API = local ? 'http://localhost:8787' : URL_PRODUCAO;
  const SVG = 'http://www.w3.org/2000/svg';
  const CHAVE = 'contador:chave';

  const $ = (id) => document.getElementById(id);
  const numero = new Intl.NumberFormat('pt-BR');
  const diaLongo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
  const diaCurto = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
  const nomesPaises = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
  const NOMES_ORIGEM = { linkedin: 'LinkedIn', google: 'Google', github: 'GitHub', direto: 'Acesso direto' };

  const armazenar = {
    ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
    apagar(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
  };

  // Quem abre o painel é o dono do site: as visitas dele deixam de contar.
  armazenar.gravar('contador:ignorar', '1');

  let chave = armazenar.ler(CHAVE);
  let dias = 30;
  let ultimo = null;

  /* ---------------------------------------------------------- */
  /* Fluxo                                                      */
  /* ---------------------------------------------------------- */

  function mostrar(qual) {
    for (const id of ['form-chave', 'carregando', 'falha', 'dados']) $(id).hidden = id !== qual;
    $('trocar-chave').hidden = qual === 'form-chave';
  }

  function pedirChave(mensagem = '') {
    $('erro-chave').textContent = mensagem;
    mostrar('form-chave');
    $('campo-chave').value = '';
    $('campo-chave').focus();
  }

  async function carregar() {
    if (!API) {
      mostrar('falha');
      $('falha').querySelector('.erro').textContent = 'O contador ainda não foi publicado. Preencha URL_PRODUCAO em painel.js.';
      return;
    }
    if (!$('dados').hidden) $('dados').setAttribute('aria-busy', 'true');
    else mostrar('carregando');

    let res;
    try {
      res = await fetch(`${API}/estatisticas?dias=${dias}`, { headers: { Authorization: `Bearer ${chave}` } });
    } catch {
      mostrar('falha');
      return;
    } finally {
      $('dados').removeAttribute('aria-busy');
    }

    if (res.status === 401) {
      armazenar.apagar(CHAVE);
      chave = null;
      pedirChave('Chave incorreta. Digite de novo.');
      return;
    }
    if (!res.ok) { mostrar('falha'); return; }

    ultimo = await res.json();
    mostrar('dados');
    desenhar(ultimo);
  }

  $('form-chave').addEventListener('submit', (e) => {
    e.preventDefault();
    chave = $('campo-chave').value.trim();
    if (!chave) return;
    armazenar.gravar(CHAVE, chave);
    carregar();
  });

  $('trocar-chave').addEventListener('click', () => {
    armazenar.apagar(CHAVE);
    chave = null;
    pedirChave();
  });

  $('tentar-de-novo').addEventListener('click', carregar);

  for (const botao of document.querySelectorAll('.periodo button')) {
    botao.addEventListener('click', () => {
      dias = Number(botao.dataset.dias);
      for (const b of document.querySelectorAll('.periodo button')) b.setAttribute('aria-pressed', String(b === botao));
      carregar();
    });
  }

  let redimensionar;
  window.addEventListener('resize', () => {
    clearTimeout(redimensionar);
    redimensionar = setTimeout(() => { if (ultimo && !$('dados').hidden) desenhar(ultimo); }, 120);
  });

  /* ---------------------------------------------------------- */
  /* Desenho                                                    */
  /* ---------------------------------------------------------- */

  function plural(n, um, varios) { return `${numero.format(n)} ${n === 1 ? um : varios}`; }

  function desenhar(d) {
    const titulo = $('total');
    titulo.replaceChildren();
    const n = document.createElement('span');
    n.className = 'total-numero';
    n.textContent = numero.format(d.total);
    titulo.append(n, `${d.total === 1 ? 'visita' : 'visitas'} nos últimos ${d.dias} dias`);

    $('vazio').hidden = d.total > 0;
    $('conteudo-dados').hidden = d.total === 0;
    if (d.total === 0) return;

    const porDia = d.porDia.map(({ dia, visitas }) => {
      const data = new Date(`${dia}T12:00:00Z`);
      return { curto: diaCurto.format(data), longo: diaLongo.format(data), valor: visitas };
    });
    const porHora = d.porHora.map((visitas, h) => ({ curto: `${h}h`, longo: `das ${h}h às ${(h + 1) % 24}h`, valor: visitas }));

    barras($('grafico-dia'), porDia, 'Visitas por dia');
    barras($('grafico-hora'), porHora, 'Visitas por hora do dia');
    tabela($('tabela-dia'), porDia);
    tabela($('tabela-hora'), porHora);
    ranking($('origens'), d.origens.map((o) => ({ nome: NOMES_ORIGEM[o.origem] ?? o.origem, valor: o.visitas })));
    ranking($('paises'), d.paises.map((p) => ({ nome: nomePais(p.pais), valor: p.visitas })));
  }

  function nomePais(codigo) {
    if (!/^[A-Z]{2}$/.test(codigo) || codigo === 'XX' || codigo === 'T1') return 'Desconhecido';
    try { return nomesPaises.of(codigo) ?? codigo; } catch { return codigo; }
  }

  /** Teto "redondo" do eixo e o passo entre as linhas de grade (1, 2 ou 5 × 10^k). */
  function escala(max) {
    if (max <= 4) return { teto: Math.max(max, 1), passo: 1 };
    const bruto = max / 4;
    const base = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 5, 10].map((m) => m * base).find((p) => p >= bruto);
    return { teto: Math.ceil(max / passo) * passo, passo };
  }

  function el(nome, attrs = {}) {
    const no = document.createElementNS(SVG, nome);
    for (const [k, v] of Object.entries(attrs)) no.setAttribute(k, v);
    return no;
  }

  /** Coluna com 4px arredondados no topo e base reta. */
  function caminhoBarra(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function barras(area, itens, rotulo) {
    const largura = area.clientWidth;
    const altura = area.clientHeight;
    const m = { topo: 8, dir: 4, base: 26, esq: 36 };
    const w = largura - m.esq - m.dir;
    const h = altura - m.topo - m.base;
    const { teto, passo } = escala(Math.max(...itens.map((i) => i.valor)));
    const y = (v) => m.topo + h - (v / teto) * h;
    const faixa = w / itens.length;
    const larguraBarra = Math.max(1, Math.min(24, faixa - 2));

    const svg = el('svg', { viewBox: `0 0 ${largura} ${altura}`, role: 'group', tabindex: '0', 'aria-label': `${rotulo}. Use as setas para ler cada barra.` });

    const grade = el('g', { class: 'grade' });
    const eixo = el('g', { class: 'eixo' });
    for (let v = 0; v <= teto; v += passo) {
      const yy = Math.round(y(v)) + 0.5;
      grade.append(el('line', { x1: m.esq, x2: largura - m.dir, y1: yy, y2: yy }));
      const t = el('text', { x: m.esq - 8, y: yy, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
      t.textContent = numero.format(v);
      eixo.append(t);
    }

    // No máximo ~8 rótulos no eixo de baixo, para não colidirem.
    const cadaQuantos = Math.ceil(itens.length / Math.max(2, Math.floor(w / 56)));
    const marcas = el('g');
    const alvos = el('g');
    itens.forEach((item, i) => {
      const x0 = m.esq + i * faixa;
      const x = x0 + (faixa - larguraBarra) / 2;
      if (item.valor > 0) {
        marcas.append(el('path', { class: 'barra', d: caminhoBarra(x, y(item.valor), larguraBarra, m.topo + h - y(item.valor)) }));
      } else {
        marcas.append(el('g')); // mantém o índice alinhado com os itens
      }
      alvos.append(el('rect', { class: 'alvo', x: x0, y: m.topo, width: faixa, height: h, 'data-i': i }));
      if (i % cadaQuantos === 0) {
        const t = el('text', { x: x0 + faixa / 2, y: altura - 6, 'text-anchor': 'middle' });
        t.textContent = item.curto;
        eixo.append(t);
      }
    });

    svg.append(grade, marcas, eixo, alvos);
    area.replaceChildren(svg);

    let ativo = -1;
    function ativar(i) {
      if (ativo >= 0) marcas.children[ativo].classList?.remove('ativa');
      ativo = i;
      if (i < 0) { esconderDica(); return; }
      marcas.children[i].classList?.add('ativa');
      const caixa = alvos.children[i].getBoundingClientRect();
      const topoBarra = itens[i].valor > 0 ? marcas.children[i].getBoundingClientRect().top : caixa.bottom;
      mostrarDica(plural(itens[i].valor, 'visita', 'visitas'), itens[i].longo, caixa.left + caixa.width / 2, topoBarra);
    }

    alvos.addEventListener('pointermove', (e) => {
      const i = Number(e.target.getAttribute?.('data-i'));
      if (Number.isInteger(i) && i !== ativo) ativar(i);
    });
    svg.addEventListener('pointerleave', () => ativar(-1));
    svg.addEventListener('blur', () => ativar(-1));
    svg.addEventListener('focus', () => ativar(ativo >= 0 ? ativo : itens.length - 1));
    svg.addEventListener('keydown', (e) => {
      const passos = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
      if (!(e.key in passos)) return;
      e.preventDefault();
      ativar(Math.min(itens.length - 1, Math.max(0, (ativo < 0 ? itens.length - 1 : ativo) + passos[e.key])));
    });
  }

  function mostrarDica(valor, rotulo, x, yTopo) {
    const dica = $('dica');
    dica.querySelector('strong').textContent = valor;
    dica.querySelector('span').textContent = rotulo;
    dica.hidden = false;
    const { width, height } = dica.getBoundingClientRect();
    const esquerda = Math.min(window.innerWidth - width - 8, Math.max(8, x - width / 2));
    const topo = yTopo - height - 10 < 8 ? yTopo + 10 : yTopo - height - 10;
    dica.style.left = `${esquerda}px`;
    dica.style.top = `${topo}px`;
  }

  function esconderDica() { $('dica').hidden = true; }
  window.addEventListener('scroll', esconderDica, { passive: true });

  function tabela(corpo, itens) {
    corpo.replaceChildren(...itens.map((item) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      const b = document.createElement('td');
      a.textContent = item.longo;
      b.textContent = numero.format(item.valor);
      tr.append(a, b);
      return tr;
    }));
  }

  function ranking(lista, itens) {
    if (itens.length === 0) {
      const li = document.createElement('li');
      li.className = 'ranking-vazio';
      li.textContent = 'Nenhuma visita neste período.';
      lista.replaceChildren(li);
      return;
    }
    const max = Math.max(...itens.map((i) => i.valor));
    lista.replaceChildren(...itens.map((item) => {
      const li = document.createElement('li');
      const nome = document.createElement('span');
      const valor = document.createElement('span');
      const trilho = document.createElement('span');
      const preenchido = document.createElement('span');
      nome.textContent = item.nome;
      valor.className = 'valor';
      valor.textContent = numero.format(item.valor);
      trilho.className = 'trilho';
      trilho.setAttribute('aria-hidden', 'true');
      preenchido.className = 'preenchido';
      preenchido.style.width = `${(item.valor / max) * 100}%`;
      trilho.append(preenchido);
      li.append(nome, valor, trilho);
      return li;
    }));
  }

  /* ---------------------------------------------------------- */

  if (chave) carregar();
  else pedirChave();
})();
