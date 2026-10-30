/* Read-only account display plus desktop loading/fade. No login or token refresh. */
(function () {
  var resolveReady;
  var ready = new Promise(function (resolve) { resolveReady = resolve; });
  var resolveAccount;
  var accountReady = new Promise(function (resolve) { resolveAccount = resolve; });
  var accountRequested = false;
  var desktopRequested = false;
  window.__CODEX_READ_ACCOUNT__ = function () {
    if (!accountRequested) {
      accountRequested = true;
      window.chrome.webview.postMessage('account-request');
    }
    return accountReady;
  };
  window.__CODEX_WAIT_ACCOUNT__ = function () { return accountReady; };
  window.__CODEX_START_DESKTOP__ = function () {
    if (!desktopRequested) {
      desktopRequested = true;
      window.chrome.webview.postMessage('desktop-request');
    }
    return ready;
  };
  if (window.__CODEX_NATIVE_MODE__) {
    window.__CODEX_NATIVE_HANDOFF__ = function () {
      window.chrome.webview.postMessage('animation-handoff');
      return true;
    };
  }
  window.chrome.webview.addEventListener('message', function (event) {
    if (event.data === 'desktop-ready') { resolveReady(); return; }
    if (event.data.type === 'window-state') {
      document.documentElement.style.setProperty('--window-control-scale', event.data.scale);
      var minimize = document.getElementById('minimize-launcher');
      minimize.disabled = !event.data.canMinimize;
      minimize.title = event.data.canMinimize ? '最小化' : '等待 Codex 窗口出现后可最小化';
      var button = document.getElementById('maximize-launcher');
      button.title = event.data.maximized ? '还原' : '最大化';
      button.setAttribute('aria-label', button.title);
      button.classList.toggle('is-maximized', event.data.maximized);
      return;
    }
    if (event.data.type === 'account-info') {
      window.__DSH_STARTUP_API__.setAccount(event.data);
      resolveAccount();
    }
  });
  window.addEventListener('error', function () { window.chrome.webview.postMessage('animation-error'); });
  window.addEventListener('dsh-startup:done', function () {
    window.chrome.webview.postMessage('animation-done');
  }, { once: true });
  document.addEventListener('DOMContentLoaded', function () {
    ['minimize-launcher', 'maximize-launcher', 'close-launcher'].forEach(function (id) {
      document.getElementById(id).addEventListener('click', function () {
        window.chrome.webview.postMessage(id === 'maximize-launcher' ? 'toggle-maximize-launcher' : id);
      });
    });
    window.chrome.webview.postMessage('animation-started');
  });
})();
