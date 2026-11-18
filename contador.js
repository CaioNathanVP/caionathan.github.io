// Conta uma visita por sessão da aba. Sem cookies e sem dados pessoais:
// manda só o caminho da página e de onde a pessoa veio.
(() => {
  // Endereço do Worker publicado (ver contador/README.md).
  const URL_PRODUCAO = 'https://portfolio-contador.portfolio-contador.workers.dev';

  try {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const api = local ? 'http://localhost:8787' : URL_PRODUCAO;
    if (!api) return;

    if (localStorage.getItem('contador:ignorar')) return; // as visitas do dono do site
    if (navigator.webdriver || navigator.globalPrivacyControl) return;
    if (sessionStorage.getItem('contador:contado')) return;

    const dados = JSON.stringify({ p: location.pathname, r: document.referrer });
    if (navigator.sendBeacon(api + '/v', new Blob([dados], { type: 'text/plain' }))) {
      sessionStorage.setItem('contador:contado', '1');
    }
  } catch {
    // Se a contagem falhar, o site continua igual.
  }
})();
