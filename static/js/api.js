/* ═══════════════════════════════════════════════════════════════════
   ATM API Layer — Flask bridge + COBOL command logging
   ═══════════════════════════════════════════════════════════════════ */
const ATMAPI = {
  commandLog: [],
  maxLog: 50,
  onCommand: null, /* callback(entry) for visualiser */

  /* Core API call with COBOL command logging */
  call(path, method, body) {
    const start = performance.now();
    const command = this._inferCommand(path, body);
    const opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (method !== 'GET' && body !== null) {
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        const elapsed = Math.round(performance.now() - start);
        const entry = {
          time: new Date().toLocaleTimeString('en-GB'),
          command: command,
          response: data.status === 'ok' ? 'OK' : 'ERR: ' + (data.message || data.code || ''),
          elapsed: elapsed,
          success: data.status === 'ok',
        };
        this.commandLog.push(entry);
        if (this.commandLog.length > this.maxLog) this.commandLog.shift();
        if (this.onCommand) this.onCommand(entry);
        return data;
      });
  },

  /* Infer the COBOL command from API path + body */
  _inferCommand(path, body) {
    if (path.includes('/login')) return 'CHECK-PIN ' + (body?.account || '?') + ' ****';
    if (path.includes('/balance')) return 'BALANCE ' + (window.ATM?.account || '?');
    if (path.includes('/withdraw')) return 'WITHDRAW ' + (window.ATM?.account || '?') + ' ' + (body?.amount || '?');
    if (path.includes('/deposit')) return 'DEPOSIT ' + (window.ATM?.account || '?') + ' ' + (body?.amount || '?');
    if (path.includes('/transfer')) return 'TRANSFER ' + (window.ATM?.account || '?') + ' ' + (body?.destination || '?') + ' ' + (body?.amount || '?');
    if (path.includes('/statement')) return 'MINI-STMT ' + (window.ATM?.account || '?');
    if (path.includes('/change-pin')) return 'CHANGE-PIN ' + (window.ATM?.account || '?') + ' **** ****';
    if (path.includes('/admin/')) return 'ADMIN ' + path.split('/admin/')[1]?.toUpperCase();
    return path;
  },

  /* Admin API calls */
  getAuditLog() { return this.call('/api/admin/audit', 'GET', null); },
  getAccounts() { return this.call('/api/admin/accounts', 'GET', null); },
  getTransLog() { return this.call('/api/admin/translog', 'GET', null); },
};
