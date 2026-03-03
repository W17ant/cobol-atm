/* ═══════════════════════════════════════════════════════════════════
   COBOL ATM Frontend — Enhanced State Machine
   Features: Card animation, UK notes, receipt, cassettes, admin,
   session timeout, COBOL visualiser, demo mode, sound
   ═══════════════════════════════════════════════════════════════════ */

/* ── Safe DOM builder ────────────────────────────────────────────── */
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) {
    if (attrs.cls)   el.className = attrs.cls;
    if (attrs.style) el.style.cssText = attrs.style;
    if (attrs.id)    el.id = attrs.id;
    if (attrs.colspan) el.colSpan = attrs.colspan;
  }
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  }
  return el;
}

function makeCursor() { return h('span', { cls: 'cursor' }); }
function makeDivider() { return h('hr', { cls: 'scr-divider' }); }
function makeSpacer() { return h('div', { cls: 'scr-spacer' }); }

function makeBackRow(label) {
  return h('div', { cls: 'scr-btn-row-right' },
    h('div', { cls: 'scr-btn-right-group' },
      h('span', { cls: 'scr-btn-label' }, label || 'Back'),
      h('span', { cls: 'scr-arrow' }, '\u25c4')
    )
  );
}

function makeBtnRows(rows) {
  var wrap = h('div', { cls: 'scr-btn-rows' });
  rows.forEach(function(r) {
    var row = h('div', { cls: 'scr-btn-row' });
    var leftGrp = h('div', { cls: 'scr-btn-left-group' });
    if (r.left) {
      leftGrp.appendChild(h('span', { cls: 'scr-arrow' }, '\u25ba'));
      leftGrp.appendChild(h('span', { cls: 'scr-btn-label' }, r.left));
    }
    var rightGrp = h('div', { cls: 'scr-btn-right-group' });
    if (r.right) {
      rightGrp.appendChild(h('span', { cls: 'scr-btn-label' }, r.right));
      rightGrp.appendChild(h('span', { cls: 'scr-arrow' }, '\u25c4'));
    }
    row.appendChild(leftGrp);
    row.appendChild(rightGrp);
    wrap.appendChild(row);
  });
  return wrap;
}

function makeInputBox(id) {
  var box = h('div', { cls: 'scr-input-box', id: id || 'inputDisplay' });
  box.appendChild(makeCursor());
  return box;
}

/* ══════════════════════════════════════════════════════════════════
   ATM State Machine
   ══════════════════════════════════════════════════════════════════ */
var ATM = {
  state: 'INSERT_CARD',
  account: '',
  userName: '',
  acctType: '',
  inputBuffer: '',
  transferDest: '',
  transferStep: 0,
  changePinStep: 0,
  changePinOld: '',
  changePinNew: '',
  withdrawOther: false,
  isAdmin: false,
  _dispensTimer: null,
  _receiptTimer: null,
  _clockInterval: null,

  /* Cassette simulation */
  cassettes: {
    50: { count: 100, max: 100 },
    20: { count: 200, max: 200 },
    10: { count: 200, max: 200 },
    5:  { count: 200, max: 200 },
  },

  /* Session timeout */
  timeoutDuration: 30,
  timeoutRemaining: 30,
  _timeoutInterval: null,
  _sessionActive: false,

  /* Demo mode */
  demoRunning: false,
  _demoAbort: false,

  /* DOM cache */
  dom: {},
  sideConfig: {},

  /* ─────────────────────────────────────────────────────────────────
     Init
     ───────────────────────────────────────────────────────────────── */
  init: function() {
    var self = this;
    var ids = ['screenContent','cashSlot','cardSlot','debitCard','cardLed',
               'notesContainer','receiptPaper','atmClock','timeoutBar',
               'cobolPanel','cobolLog','cobolToggle',
               'btnL1','btnL2','btnL3','btnL4',
               'btnR1','btnR2','btnR3','btnR4'];
    ids.forEach(function(id) {
      self.dom[id] = document.getElementById(id);
    });

    /* Side button click handlers */
    ['L1','L2','L3','L4','R1','R2','R3','R4'].forEach(function(pos) {
      self.dom['btn' + pos].addEventListener('click', function() {
        self.flashBtn(self.dom['btn' + pos]);
        ATMSound.beep();
        self.resetTimeout();
        self.handleSideButton(pos);
      });
    });

    /* PIN pad click handlers */
    document.querySelectorAll('.pin-key').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.dataset.key;
        if (!key) return;
        self.flashBtn(btn);
        ATMSound.beep();
        self.resetTimeout();
        self.handlePinKey(key);
      });
    });

    /* Keyboard handler */
    document.addEventListener('keydown', function(e) {
      self.resetTimeout();
      self.handleKeyboard(e);
    });

    /* Card slot click */
    self.dom.cardSlot.addEventListener('click', function() {
      if (self.state === 'INSERT_CARD') {
        document.querySelector('.pin-key')?.focus();
      }
    });

    /* Cash slot click — collect notes */
    self.dom.cashSlot.parentElement.addEventListener('click', function() {
      self.collectNotes();
    });

    /* Receipt click — tear */
    if (self.dom.receiptPaper) {
      self.dom.receiptPaper.addEventListener('click', function() {
        self.tearReceipt();
      });
    }

    /* COBOL panel toggle */
    if (self.dom.cobolToggle) {
      self.dom.cobolToggle.addEventListener('click', function() {
        self.dom.cobolPanel.classList.toggle('open');
        self.dom.cobolToggle.textContent = self.dom.cobolPanel.classList.contains('open') ? 'COBOL \u25ba' : '\u25c4 COBOL';
      });
    }

    /* COBOL API command logging */
    ATMAPI.onCommand = function(entry) {
      self.addCobolEntry(entry);
    };

    /* Demo + sound buttons */
    var demoBtn = document.getElementById('demoBtn');
    var soundBtn = document.getElementById('soundBtn');
    var stackBtn = document.getElementById('stackBtn');
    if (demoBtn) demoBtn.addEventListener('click', function() { self.toggleDemo(); });
    if (soundBtn) soundBtn.addEventListener('click', function() {
      var on = ATMSound.toggle();
      soundBtn.textContent = on ? '\u{1f50a}' : '\u{1f507}';
      soundBtn.classList.toggle('active', on);
      if (on) ATMSound.startHum();
    });
    if (stackBtn) stackBtn.addEventListener('click', function() { self.showStack(); });

    /* Stack overlay close */
    var stackOverlay = document.getElementById('stackOverlay');
    if (stackOverlay) stackOverlay.addEventListener('click', function() {
      stackOverlay.classList.remove('visible');
    });

    /* Start clock */
    self.updateClock();
    self._clockInterval = setInterval(function() { self.updateClock(); }, 1000);

    /* Activity tracking for timeout */
    document.addEventListener('mousemove', function() { self.resetTimeout(); });

    /* Update cassette display */
    self.updateCassetteDisplay();

    self.goto('INSERT_CARD');
  },

  /* ─── Button press animation ────────────────────────────────────── */
  flashBtn: function(el) {
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function() { el.classList.remove('pressed'); }, 150);
  },

  /* ─── State transitions ─────────────────────────────────────────── */
  goto: function(state) {
    this.state = state;
    this.inputBuffer = '';
    this.render();
  },

  /* ─── Side buttons ──────────────────────────────────────────────── */
  setSideButtons: function(config) {
    this.sideConfig = config || {};
    var self = this;
    ['L1','L2','L3','L4','R1','R2','R3','R4'].forEach(function(pos) {
      self.dom['btn' + pos].classList.toggle('inactive', !(config && config[pos]));
    });
  },

  handleSideButton: function(pos) {
    var cfg = this.sideConfig[pos];
    if (cfg && typeof cfg.fn === 'function') cfg.fn();
  },

  /* ─── Input handling ────────────────────────────────────────────── */
  handlePinKey: function(key) {
    if (key === 'cancel') { this.handleCancel(); return; }
    if (key === 'clear')  { this.handleClear();  return; }
    if (key === 'enter')  { this.handleEnter();  return; }
    this.handleDigit(key);
  },

  handleKeyboard: function(e) {
    var self = this;
    if (e.key >= '0' && e.key <= '9') {
      var btn = document.querySelector('.pin-key[data-key="' + e.key + '"]');
      if (btn) self.flashBtn(btn);
      ATMSound.beep();
      self.handleDigit(e.key);
    } else if (e.key === 'Enter') {
      var enterBtn = document.querySelector('.pin-key.enter-key');
      if (enterBtn) self.flashBtn(enterBtn);
      ATMSound.beep();
      self.handleEnter();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      var clearBtn = document.querySelector('.pin-key.clear-key');
      if (clearBtn) self.flashBtn(clearBtn);
      ATMSound.beep();
      self.handleClear();
    } else if (e.key === 'Escape') {
      var cancelBtn = document.querySelector('.pin-key.cancel-key');
      if (cancelBtn) self.flashBtn(cancelBtn);
      ATMSound.beep();
      self.handleCancel();
    }
  },

  handleDigit: function(d) {
    var s = this.state;
    var buf = this.inputBuffer;
    if (s === 'INSERT_CARD') {
      if (d !== '.' && buf.length < 10) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
    } else if (s === 'ENTER_PIN' || s === 'CHANGE_PIN') {
      if (d !== '.' && buf.length < 4) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
    } else if (s === 'WITHDRAW' && this.withdrawOther) {
      if (d === '.') return;
      if (buf.length < 6) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
    } else if (s === 'DEPOSIT') {
      if (d === '.') return;
      if (buf.length < 6) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
    } else if (s === 'TRANSFER') {
      if (this.transferStep === 0) {
        if (d !== '.' && buf.length < 10) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
      } else {
        if (d === '.') return;
        if (buf.length < 6) { this.inputBuffer = buf + d; this.updateInputDisplay(); }
      }
    }
  },

  handleClear: function() {
    if (this.inputBuffer.length > 0) {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      this.updateInputDisplay();
    }
  },

  handleCancel: function() {
    var s = this.state;
    if (s === 'INSERT_CARD') { this.inputBuffer = ''; this.updateInputDisplay(); }
    else if (s === 'ENTER_PIN') { this.goto('INSERT_CARD'); }
    else if (s === 'WITHDRAW') {
      if (this.withdrawOther) { this.withdrawOther = false; this.goto('WITHDRAW'); }
      else { this.goto('MAIN_MENU'); }
    } else if (s === 'CHANGE_PIN') { this.changePinStep = 0; this.goto('MAIN_MENU'); }
    else if (s === 'TRANSFER') { this.transferStep = 0; this.goto('MAIN_MENU'); }
    else if (s.startsWith('ADMIN')) { this.goto('ADMIN_MENU'); }
    else { this.goto('MAIN_MENU'); }
  },

  handleEnter: function() {
    var s = this.state;
    if      (s === 'INSERT_CARD')               this.doCardEntry();
    else if (s === 'ENTER_PIN')                 this.doLogin();
    else if (s === 'WITHDRAW' && this.withdrawOther) this.doWithdraw(this.inputBuffer);
    else if (s === 'DEPOSIT')                   this.doDeposit();
    else if (s === 'TRANSFER')                  this.doTransferStep();
    else if (s === 'CHANGE_PIN')                this.doChangePinStep();
  },

  updateInputDisplay: function() {
    var box = document.getElementById('inputDisplay');
    if (!box) { this.render(); return; }
    while (box.firstChild) box.removeChild(box.firstChild);
    var display = this.inputBuffer;
    if (this.state === 'ENTER_PIN' || this.state === 'CHANGE_PIN') {
      display = '\u25cf'.repeat(this.inputBuffer.length);
    }
    if (display.length > 0) box.appendChild(document.createTextNode(display));
    box.appendChild(makeCursor());
  },

  /* ─── Render dispatcher ─────────────────────────────────────────── */
  render: function() {
    var fn = {
      INSERT_CARD: this.renderInsertCard,
      ENTER_PIN:   this.renderEnterPin,
      MAIN_MENU:   this.renderMainMenu,
      BALANCE:     this.renderBalance,
      WITHDRAW:    this.renderWithdraw,
      DEPOSIT:     this.renderDeposit,
      TRANSFER:    this.renderTransfer,
      MINI_STMT:   this.renderMiniStmt,
      CHANGE_PIN:  this.renderChangePin,
      GOODBYE:     this.renderGoodbye,
      ADMIN_MENU:  this.renderAdminMenu,
      ADMIN_AUDIT: this.renderAdminAudit,
      ADMIN_CASS:  this.renderAdminCassettes,
      ADMIN_ACCTS: this.renderAdminAccounts,
      ADMIN_TRANS: this.renderAdminTranslog,
      ADMIN_STATUS: this.renderAdminStatus,
    }[this.state];
    if (fn) fn.call(this);
    else this.renderInsertCard();
  },

  setScreen: function(nodes) {
    var sc = this.dom.screenContent;
    while (sc.firstChild) sc.removeChild(sc.firstChild);
    (Array.isArray(nodes) ? nodes : [nodes]).forEach(function(n) { if (n) sc.appendChild(n); });
  },

  /* ── Account type theming ───────────────────────────────────────── */
  applyTheme: function(type) {
    var machine = document.querySelector('.atm-machine');
    machine.classList.remove('theme-savings', 'theme-business', 'theme-admin');
    var t = (type || '').toUpperCase();
    if (this.isAdmin) machine.classList.add('theme-admin');
    else if (t.indexOf('SAV') !== -1 || t === 'S') machine.classList.add('theme-savings');
  },

  clearTheme: function() {
    document.querySelector('.atm-machine').classList.remove('theme-savings', 'theme-business', 'theme-admin');
  },

  /* ══════════════════════════════════════════════════════════════════
     INSERT_CARD
     ══════════════════════════════════════════════════════════════════ */
  renderInsertCard: function() {
    this.setSideButtons({});
    this.stopTimeout();
    this.clearTheme();
    this.setScreen([
      h('div', { cls: 'scr-title' },    'WELCOME TO'),
      h('div', { cls: 'scr-title-sm' }, 'COBOL NATIONAL BANK'),
      makeDivider(),
      makeSpacer(),
      h('div', { cls: 'scr-label-center' }, 'Please Enter Your'),
      h('div', { cls: 'scr-label-center' }, 'Account Number'),
      makeInputBox('inputDisplay'),
      h('div', { cls: 'scr-label-xs', style: 'margin-top:4px;' }, '[10 digits] then press ENT'),
      makeSpacer(),
    ]);
  },

  doCardEntry: function() {
    if (this.inputBuffer.length < 10) {
      this.showTempMessage('Please enter full 10-digit\naccount number', 'error', 2000);
      return;
    }
    this.account = this.inputBuffer;
    /* Update debit card number */
    var cardNum = document.getElementById('cardNumber');
    if (cardNum) {
      var last4 = this.account.slice(-4);
      cardNum.textContent = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022 ' + last4;
    }
    /* Animate card insert */
    this.animateCardInsert();
    var self = this;
    setTimeout(function() { self.goto('ENTER_PIN'); }, 1800);
  },

  /* ══════════════════════════════════════════════════════════════════
     ENTER_PIN
     ══════════════════════════════════════════════════════════════════ */
  renderEnterPin: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Cancel', fn: function() { self.goto('INSERT_CARD'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'ENTER YOUR PIN'),
      makeDivider(),
      h('div', { cls: 'scr-label-center', style: 'margin-top:4px;' }, 'Account: ' + this.account),
      makeSpacer(),
      h('div', { cls: 'scr-label-center' }, 'PIN (4 digits):'),
      makeInputBox('inputDisplay'),
      makeSpacer(),
      makeBackRow('Cancel'),
    ]);
  },

  doLogin: function() {
    var self = this;
    if (this.inputBuffer.length < 4) {
      this.showTempMessage('PIN must be 4 digits', 'error', 2000);
      return;
    }
    var pin = this.inputBuffer;

    /* Check for admin maintenance mode */
    if (this.account === '9999999999' && pin === '0000') {
      this.isAdmin = true;
      this.userName = 'System Admin';
      this.acctType = 'MAINTENANCE';
      this.applyTheme('admin');
      this.startTimeout();
      ATMSound.successChime();
      this.goto('ADMIN_MENU');
      return;
    }

    this.showProcessing('CHECK-PIN ' + this.account + ' ****');
    ATMAPI.call('/api/login', 'POST', { account: this.account, pin: pin })
      .then(function(res) {
        if (res.status === 'ok') {
          self.userName = res.name || 'Customer';
          self.acctType = res.type || '';
          self.isAdmin = false;
          self.applyTheme(self.acctType);
          self.startTimeout();
          ATMSound.successChime();
          self.goto('MAIN_MENU');
        } else {
          self.dom.cardLed.classList.add('error');
          ATMSound.errorBuzz();
          setTimeout(function() { self.dom.cardLed.classList.remove('error'); }, 2000);
          self.showTempMessage(res.message || 'Invalid PIN', 'error', 2500, function() {
            self.inputBuffer = '';
            self.goto('ENTER_PIN');
          });
        }
      })
      .catch(function() {
        ATMSound.errorBuzz();
        self.showTempMessage('Connection error', 'error', 2500, function() {
          self.inputBuffer = '';
          self.goto('ENTER_PIN');
        });
      });
  },

  /* ══════════════════════════════════════════════════════════════════
     MAIN_MENU
     ══════════════════════════════════════════════════════════════════ */
  renderMainMenu: function() {
    var self = this;
    this.setSideButtons({
      L1: { label: 'Check Balance',  fn: function() { self.goto('BALANCE'); } },
      L2: { label: 'Withdraw Cash',  fn: function() { self.withdrawOther = false; self.goto('WITHDRAW'); } },
      L3: { label: 'Mini Statement', fn: function() { self.goto('MINI_STMT'); } },
      R1: { label: 'Deposit',        fn: function() { self.goto('DEPOSIT'); } },
      R2: { label: 'Transfer',       fn: function() { self.transferStep = 0; self.goto('TRANSFER'); } },
      R3: { label: 'Change PIN',     fn: function() { self.changePinStep = 0; self.goto('CHANGE_PIN'); } },
      R4: { label: 'Exit',           fn: function() { self.doLogout(); } },
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'MAIN MENU'),
      makeDivider(),
      h('div', { cls: 'scr-label-center', style: 'color:#00aa00;' }, 'Welcome,'),
      h('div', { cls: 'scr-subtitle' }, this.userName),
      h('div', { cls: 'scr-label-xs', style: 'margin-bottom:2px;' }, this.acctType),
      makeDivider(),
      makeBtnRows([
        { left: 'Check Balance',  right: 'Deposit'    },
        { left: 'Withdraw Cash',  right: 'Transfer'   },
        { left: 'Mini Statement', right: 'Change PIN' },
        { left: '',               right: 'Exit'       },
      ]),
    ]);
  },

  doLogout: function() {
    var self = this;
    this.stopTimeout();
    ATMAPI.call('/api/logout', 'POST', {}).catch(function() {}).finally(function() {
      self.goto('GOODBYE');
    });
    setTimeout(function() {
      if (self.state !== 'GOODBYE') self.goto('GOODBYE');
    }, 1500);
  },

  /* ══════════════════════════════════════════════════════════════════
     BALANCE
     ══════════════════════════════════════════════════════════════════ */
  renderBalance: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'ACCOUNT BALANCE'),
      makeDivider(),
      h('div', { cls: 'scr-loading', style: 'margin-top:8px;' }, 'Loading...'),
      makeSpacer(),
      makeBackRow('Back'),
    ]);
    this.fetchBalance();
  },

  fetchBalance: function() {
    var self = this;
    this.showProcessing('BALANCE ' + this.account);
    ATMAPI.call('/api/balance', 'GET', null)
      .then(function(res) {
        if (res.status === 'ok') {
          self.setSideButtons({
            R3: { label: 'Print', fn: function() {
              self.printReceipt({ type: 'BALANCE', amount: null, balance: res.balance });
            }},
            R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
          });
          self.setScreen([
            h('div', { cls: 'scr-title' }, 'ACCOUNT BALANCE'),
            makeDivider(),
            makeSpacer(),
            h('div', { cls: 'scr-label-center' }, res.type || self.acctType),
            h('div', { cls: 'scr-balance-big' }, '\u00a3' + self.formatAmount(res.balance)),
            h('div', { cls: 'scr-label-xs', style: 'margin-top:2px;' }, 'Available Balance'),
            makeSpacer(),
            makeBtnRows([
              { left: '', right: '' },
              { left: '', right: '' },
              { left: '', right: 'Print' },
              { left: '', right: 'Back' },
            ]),
          ]);
        } else {
          self.showBalanceError(res.message);
        }
      })
      .catch(function() { self.showBalanceError('Connection error'); });
  },

  showBalanceError: function(msg) {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'ACCOUNT BALANCE'),
      makeDivider(), makeSpacer(),
      h('div', { cls: 'scr-error-line' }, msg || 'Error'),
      makeSpacer(), makeBackRow('Back'),
    ]);
  },

  /* ══════════════════════════════════════════════════════════════════
     WITHDRAW
     ══════════════════════════════════════════════════════════════════ */
  renderWithdraw: function() {
    var self = this;
    if (this.withdrawOther) {
      this.setSideButtons({
        R4: { label: 'Cancel', fn: function() { self.withdrawOther = false; self.goto('WITHDRAW'); } }
      });
      this.setScreen([
        h('div', { cls: 'scr-title' }, 'WITHDRAWAL'),
        makeDivider(),
        h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'Enter Amount:'),
        makeInputBox('inputDisplay'),
        h('div', { cls: 'scr-label-xs' }, 'Press ENT to confirm'),
        makeSpacer(),
        makeBackRow('Cancel'),
      ]);
      return;
    }
    this.setSideButtons({
      L1: { label: '\u00a320',  fn: function() { self.doWithdraw('20');  } },
      L2: { label: '\u00a350',  fn: function() { self.doWithdraw('50');  } },
      L3: { label: '\u00a3100', fn: function() { self.doWithdraw('100'); } },
      L4: { label: '\u00a3200', fn: function() { self.doWithdraw('200'); } },
      R1: { label: '\u00a3300', fn: function() { self.doWithdraw('300'); } },
      R2: { label: '\u00a3500', fn: function() { self.doWithdraw('500'); } },
      R3: { label: 'Other',    fn: function() { self.withdrawOther = true; self.inputBuffer = ''; self.render(); } },
      R4: { label: 'Cancel',   fn: function() { self.goto('MAIN_MENU'); } },
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'WITHDRAWAL'),
      makeDivider(),
      h('div', { cls: 'scr-label-xs', style: 'margin:4px 0;' }, 'Select amount or choose Other'),
      makeBtnRows([
        { left: '\u00a320',  right: '\u00a3300' },
        { left: '\u00a350',  right: '\u00a3500' },
        { left: '\u00a3100', right: 'Other'     },
        { left: '\u00a3200', right: 'Cancel'    },
      ]),
    ]);
  },

  doWithdraw: function(amount) {
    var self = this;
    var amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      this.showTempMessage('Please enter a valid amount', 'error', 2000);
      return;
    }
    /* Check cassettes can dispense */
    var notes = this.splitDenominations(amt);
    if (!notes) {
      ATMSound.errorBuzz();
      this.showTempMessage('Unable to dispense this amount.\nPlease choose a different amount.', 'error', 3000);
      return;
    }
    this.showProcessing('WITHDRAW ' + this.account + ' ' + amount);
    ATMAPI.call('/api/withdraw', 'POST', { amount: String(amount) })
      .then(function(res) {
        if (res.status === 'ok') {
          self.withdrawOther = false;
          /* Deplete cassettes */
          notes.forEach(function(n) { self.cassettes[n].count--; });
          self.updateCassetteDisplay();
          /* Dispense notes */
          self.dispenseNotes(notes);
          ATMSound.cashDispense();
          self.setSideButtons({
            R3: { label: 'Receipt', fn: function() {
              self.printReceipt({ type: 'WITHDRAWAL', amount: res.amount, balance: res.balance });
            }},
            R4: { label: 'Done', fn: function() { self.goto('MAIN_MENU'); } }
          });
          self.setScreen([
            h('div', { cls: 'scr-title', style: 'color:#44ff44;' }, 'WITHDRAWAL OK'),
            makeDivider(),
            makeSpacer(),
            h('div', { cls: 'scr-label-center' }, 'Amount dispensed:'),
            h('div', { cls: 'scr-balance-big' }, '\u00a3' + self.formatAmount(res.amount)),
            h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'New Balance:'),
            h('div', { cls: 'scr-value' }, '\u00a3' + self.formatAmount(res.balance)),
            h('div', { cls: 'scr-label-xs', style: 'margin-top:4px;animation:pulse 1.2s infinite;' }, '\u25bc Please collect your cash \u25bc'),
            makeSpacer(),
            makeBtnRows([
              { left: '', right: '' },
              { left: '', right: '' },
              { left: '', right: 'Receipt' },
              { left: '', right: 'Done' },
            ]),
          ]);
          ATMSound.successChime();
        } else {
          self.withdrawOther = false;
          ATMSound.errorBuzz();
          self.showTempMessage(res.message || 'Transaction failed', 'error', 2500, function() {
            self.goto('WITHDRAW');
          });
        }
      })
      .catch(function() {
        ATMSound.errorBuzz();
        self.showTempMessage('Connection error', 'error', 2500, function() {
          self.withdrawOther = false;
          self.goto('WITHDRAW');
        });
      });
  },

  /* ══════════════════════════════════════════════════════════════════
     DEPOSIT
     ══════════════════════════════════════════════════════════════════ */
  renderDeposit: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Cancel', fn: function() { self.goto('MAIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'DEPOSIT'),
      makeDivider(),
      h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'Enter deposit amount:'),
      makeInputBox('inputDisplay'),
      h('div', { cls: 'scr-label-xs' }, 'Press ENT to confirm'),
      makeSpacer(),
      makeBackRow('Cancel'),
    ]);
  },

  doDeposit: function() {
    var self = this;
    var amount = this.inputBuffer;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      this.showTempMessage('Please enter a valid amount', 'error', 2000);
      return;
    }
    this.showProcessing('DEPOSIT ' + this.account + ' ' + amount);
    ATMAPI.call('/api/deposit', 'POST', { amount: amount })
      .then(function(res) {
        if (res.status === 'ok') {
          ATMSound.successChime();
          self.setSideButtons({
            R3: { label: 'Receipt', fn: function() {
              self.printReceipt({ type: 'DEPOSIT', amount: res.amount, balance: res.balance });
            }},
            R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
          });
          self.setScreen([
            h('div', { cls: 'scr-title', style: 'color:#44ff44;' }, 'DEPOSIT OK'),
            makeDivider(), makeSpacer(),
            h('div', { cls: 'scr-label-center' }, 'Amount deposited:'),
            h('div', { cls: 'scr-balance-big' }, '\u00a3' + self.formatAmount(res.amount)),
            h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'New Balance:'),
            h('div', { cls: 'scr-value' }, '\u00a3' + self.formatAmount(res.balance)),
            makeSpacer(),
            makeBtnRows([
              { left: '', right: '' }, { left: '', right: '' },
              { left: '', right: 'Receipt' }, { left: '', right: 'Back' },
            ]),
          ]);
        } else {
          ATMSound.errorBuzz();
          self.showTempMessage(res.message || 'Deposit failed', 'error', 2500, function() {
            self.inputBuffer = '';
            self.goto('DEPOSIT');
          });
        }
      })
      .catch(function() {
        ATMSound.errorBuzz();
        self.showTempMessage('Connection error', 'error', 2500, function() { self.goto('DEPOSIT'); });
      });
  },

  /* ══════════════════════════════════════════════════════════════════
     TRANSFER
     ══════════════════════════════════════════════════════════════════ */
  renderTransfer: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Cancel', fn: function() { self.transferStep = 0; self.goto('MAIN_MENU'); } }
    });
    if (this.transferStep === 0) {
      this.setScreen([
        h('div', { cls: 'scr-title' }, 'TRANSFER'),
        makeDivider(),
        h('div', { cls: 'scr-label-xs', style: 'margin:4px 0;' }, 'Step 1 of 2'),
        h('div', { cls: 'scr-label-center' }, 'Enter destination account:'),
        makeInputBox('inputDisplay'),
        h('div', { cls: 'scr-label-xs' }, '[10 digits] ENT to continue'),
        makeSpacer(), makeBackRow('Cancel'),
      ]);
    } else {
      this.setScreen([
        h('div', { cls: 'scr-title' }, 'TRANSFER'),
        makeDivider(),
        h('div', { cls: 'scr-label-xs', style: 'margin-top:4px;' }, 'Step 2 of 2'),
        h('div', { cls: 'scr-label-xs', style: 'margin:2px 0;' }, 'To: ' + this.transferDest),
        h('div', { cls: 'scr-label-center', style: 'margin-top:4px;' }, 'Enter amount:'),
        makeInputBox('inputDisplay'),
        h('div', { cls: 'scr-label-xs' }, 'ENT to confirm transfer'),
        makeSpacer(), makeBackRow('Cancel'),
      ]);
    }
  },

  doTransferStep: function() {
    var self = this;
    if (this.transferStep === 0) {
      if (this.inputBuffer.length < 10) {
        this.showTempMessage('Enter 10-digit account number', 'error', 2000);
        return;
      }
      this.transferDest = this.inputBuffer;
      this.transferStep = 1;
      this.inputBuffer = '';
      this.render();
    } else {
      var amount = this.inputBuffer;
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        this.showTempMessage('Please enter a valid amount', 'error', 2000);
        return;
      }
      var dest = this.transferDest;
      this.showProcessing('TRANSFER ' + this.account + ' ' + dest + ' ' + amount);
      ATMAPI.call('/api/transfer', 'POST', { destination: dest, amount: amount })
        .then(function(res) {
          if (res.status === 'ok') {
            self.transferStep = 0;
            ATMSound.successChime();
            self.setSideButtons({
              R3: { label: 'Receipt', fn: function() {
                self.printReceipt({ type: 'TRANSFER', amount: res.amount, balance: res.balance, dest: dest });
              }},
              R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
            });
            self.setScreen([
              h('div', { cls: 'scr-title', style: 'color:#44ff44;' }, 'TRANSFER OK'),
              makeDivider(), makeSpacer(),
              h('div', { cls: 'scr-label-center' }, 'Transferred:'),
              h('div', { cls: 'scr-balance-big' }, '\u00a3' + self.formatAmount(res.amount)),
              h('div', { cls: 'scr-label-xs', style: 'margin:2px 0;' }, 'To: ' + dest),
              h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'New Balance:'),
              h('div', { cls: 'scr-value' }, '\u00a3' + self.formatAmount(res.balance)),
              makeSpacer(),
              makeBtnRows([
                { left: '', right: '' }, { left: '', right: '' },
                { left: '', right: 'Receipt' }, { left: '', right: 'Back' },
              ]),
            ]);
          } else {
            ATMSound.errorBuzz();
            self.showTempMessage(res.message || 'Transfer failed', 'error', 2500, function() {
              self.inputBuffer = '';
              self.goto('TRANSFER');
            });
          }
        })
        .catch(function() {
          ATMSound.errorBuzz();
          self.showTempMessage('Connection error', 'error', 2500, function() {
            self.inputBuffer = '';
            self.goto('TRANSFER');
          });
        });
    }
  },

  /* ══════════════════════════════════════════════════════════════════
     MINI STATEMENT (Enhanced with running balance + colour coding)
     ══════════════════════════════════════════════════════════════════ */
  renderMiniStmt: function() {
    var self = this;
    this.setSideButtons({
      R3: { label: 'Print', fn: function() { /* will be set after load */ } },
      R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'MINI STATEMENT'),
      makeDivider(),
      h('div', { cls: 'scr-loading', style: 'margin-top:8px;' }, 'Loading...'),
      makeSpacer(), makeBackRow('Back'),
    ]);
    this.fetchStatement();
  },

  fetchStatement: function() {
    var self = this;
    this.showProcessing('MINI-STMT ' + this.account);
    ATMAPI.call('/api/statement', 'GET', null)
      .then(function(res) {
        if (res.status === 'ok') {
          var txns = (res.transactions || []).slice(0, 5);
          self.setSideButtons({
            R3: { label: 'Print', fn: function() {
              self.printReceipt({ type: 'STATEMENT', transactions: txns });
            }},
            R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
          });
          var contentNodes = [
            h('div', { cls: 'scr-title' }, 'MINI STATEMENT'),
            makeDivider(),
          ];
          if (txns.length === 0) {
            contentNodes.push(h('div', { cls: 'scr-label-center', style: 'margin-top:8px;' }, 'No transactions found'));
          } else {
            var table = h('table', { cls: 'scr-table' });
            var thead = h('thead', null,
              h('tr', null,
                h('th', null, 'Date'),
                h('th', null, 'Type'),
                h('th', null, 'Amount'),
                h('th', null, 'Bal')
              )
            );
            table.appendChild(thead);
            var tbody = h('tbody', null);
            txns.forEach(function(t) {
              var typeUpper = (t.type || '').toUpperCase();
              var isCr = typeUpper.indexOf('DEP') !== -1 || typeUpper.indexOf('CREDIT') !== -1;
              var amtCls = isCr ? 'amt-cr' : 'amt-dr';
              var amtPrefix = isCr ? '+' : '-';
              tbody.appendChild(h('tr', null,
                h('td', null, t.date || ''),
                h('td', null, t.type || ''),
                h('td', { cls: amtCls }, amtPrefix + '\u00a3' + (t.amount || '')),
                h('td', { cls: 'amt-bal' }, '\u00a3' + (t.balance || ''))
              ));
            });
            table.appendChild(tbody);
            var scrollWrap = h('div', { cls: 'scr-scroll' });
            scrollWrap.appendChild(table);
            contentNodes.push(scrollWrap);
          }
          contentNodes.push(makeBtnRows([
            { left: '', right: '' }, { left: '', right: '' },
            { left: '', right: 'Print' }, { left: '', right: 'Back' },
          ]));
          self.setScreen(contentNodes);
        } else {
          self.setScreen([
            h('div', { cls: 'scr-title' }, 'MINI STATEMENT'),
            makeDivider(), makeSpacer(),
            h('div', { cls: 'scr-error-line' }, res.message || 'Error'),
            makeSpacer(), makeBackRow('Back'),
          ]);
        }
      })
      .catch(function() {
        self.setScreen([
          h('div', { cls: 'scr-title' }, 'MINI STATEMENT'),
          makeDivider(), makeSpacer(),
          h('div', { cls: 'scr-error-line' }, 'Connection error'),
          makeSpacer(), makeBackRow('Back'),
        ]);
      });
  },

  /* ══════════════════════════════════════════════════════════════════
     CHANGE PIN
     ══════════════════════════════════════════════════════════════════ */
  renderChangePin: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Cancel', fn: function() { self.changePinStep = 0; self.goto('MAIN_MENU'); } }
    });
    var stepLabels = ['Enter CURRENT PIN:', 'Enter NEW PIN:', 'Confirm NEW PIN:'];
    var stepLabel = stepLabels[this.changePinStep] || stepLabels[0];
    this.setScreen([
      h('div', { cls: 'scr-title' }, 'CHANGE PIN'),
      makeDivider(),
      h('div', { cls: 'scr-label-xs', style: 'margin:4px 0;' }, 'Step ' + (this.changePinStep + 1) + ' of 3'),
      h('div', { cls: 'scr-label-center', style: 'margin-top:4px;' }, stepLabel),
      makeInputBox('inputDisplay'),
      h('div', { cls: 'scr-label-xs' }, '[4 digits] ENT to continue'),
      makeSpacer(), makeBackRow('Cancel'),
    ]);
  },

  doChangePinStep: function() {
    var self = this;
    if (this.inputBuffer.length < 4) {
      this.showTempMessage('PIN must be 4 digits', 'error', 2000);
      return;
    }
    if (this.changePinStep === 0) {
      this.changePinOld = this.inputBuffer;
      this.changePinStep = 1;
      this.inputBuffer = '';
      this.render();
    } else if (this.changePinStep === 1) {
      this.changePinNew = this.inputBuffer;
      this.changePinStep = 2;
      this.inputBuffer = '';
      this.render();
    } else {
      if (this.inputBuffer !== this.changePinNew) {
        ATMSound.errorBuzz();
        this.showTempMessage('PINs do not match\nPlease try again', 'error', 2000, function() {
          self.changePinStep = 1;
          self.changePinNew = '';
          self.inputBuffer = '';
          self.render();
        });
        return;
      }
      this.showProcessing('CHANGE-PIN ' + this.account + ' **** ****');
      ATMAPI.call('/api/change-pin', 'POST', { old_pin: this.changePinOld, new_pin: this.changePinNew })
        .then(function(res) {
          if (res.status === 'ok') {
            self.changePinStep = 0;
            ATMSound.successChime();
            self.setSideButtons({
              R4: { label: 'Back', fn: function() { self.goto('MAIN_MENU'); } }
            });
            self.setScreen([
              h('div', { cls: 'scr-title', style: 'color:#44ff44;' }, 'PIN CHANGED'),
              makeDivider(), makeSpacer(),
              h('div', { cls: 'scr-success-line' }, 'Your PIN has been updated'),
              h('div', { cls: 'scr-label-xs', style: 'margin-top:8px;' }, 'Please remember your new PIN'),
              makeSpacer(), makeBackRow('Back'),
            ]);
          } else {
            ATMSound.errorBuzz();
            self.showTempMessage(res.message || 'Failed to change PIN', 'error', 2500, function() {
              self.changePinStep = 0;
              self.changePinOld = '';
              self.changePinNew = '';
              self.inputBuffer = '';
              self.render();
            });
          }
        })
        .catch(function() {
          ATMSound.errorBuzz();
          self.showTempMessage('Connection error', 'error', 2500, function() { self.goto('CHANGE_PIN'); });
        });
    }
  },

  /* ══════════════════════════════════════════════════════════════════
     GOODBYE
     ══════════════════════════════════════════════════════════════════ */
  renderGoodbye: function() {
    var self = this;
    this.setSideButtons({});
    this.stopTimeout();
    /* Animate card eject */
    this.animateCardEject();
    ATMSound.cardMotor();
    this.setScreen([
      makeSpacer(),
      h('div', { cls: 'scr-title', style: 'font-size:24px;text-shadow:0 0 15px rgba(50,255,80,0.9);' }, 'THANK YOU'),
      makeDivider(),
      h('div', { cls: 'scr-subtitle', style: 'margin-top:8px;' }, 'Please take your card'),
      h('div', { cls: 'scr-label-xs', style: 'margin-top:8px;animation:pulse 1s infinite;' }, '\u2190 Card is being ejected'),
      makeSpacer(),
      h('div', { cls: 'scr-label-xs' }, 'Returning to home screen...'),
    ]);
    this.account = '';
    this.userName = '';
    this.acctType = '';
    this.inputBuffer = '';
    this.transferStep = 0;
    this.changePinStep = 0;
    this.isAdmin = false;
    this.clearTheme();
    setTimeout(function() {
      self.goto('INSERT_CARD');
    }, 3500);
  },

  /* ══════════════════════════════════════════════════════════════════
     ADMIN / MAINTENANCE MODE
     ══════════════════════════════════════════════════════════════════ */
  renderAdminMenu: function() {
    var self = this;
    this.setSideButtons({
      L1: { label: 'Audit Log',   fn: function() { self.goto('ADMIN_AUDIT'); } },
      L2: { label: 'Cassettes',   fn: function() { self.goto('ADMIN_CASS'); } },
      L3: { label: 'Accounts',    fn: function() { self.goto('ADMIN_ACCTS'); } },
      R1: { label: 'Trans Log',   fn: function() { self.goto('ADMIN_TRANS'); } },
      R2: { label: 'System',      fn: function() { self.goto('ADMIN_STATUS'); } },
      R4: { label: 'Exit',        fn: function() { self.doLogout(); } },
    });
    this.setScreen([
      h('div', { cls: 'scr-admin-title' }, '\u2699 MAINTENANCE MODE'),
      makeDivider(),
      h('div', { cls: 'scr-label-center', style: 'color:#ffd700;margin:4px 0;' }, 'System Administrator'),
      makeDivider(),
      makeBtnRows([
        { left: 'Audit Log',  right: 'Trans Log' },
        { left: 'Cassettes',  right: 'System'    },
        { left: 'Accounts',   right: ''           },
        { left: '',            right: 'Exit'      },
      ]),
    ]);
  },

  renderAdminAudit: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('ADMIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-admin-title' }, 'AUDIT LOG'),
      makeDivider(),
      h('div', { cls: 'scr-loading', style: 'color:#ffd700;' }, 'Loading...'),
      makeSpacer(), makeBackRow('Back'),
    ]);
    ATMAPI.getAuditLog().then(function(res) {
      if (res.status === 'ok' && res.entries) {
        var table = h('table', { cls: 'scr-admin-table' });
        table.appendChild(h('thead', null,
          h('tr', null, h('th', null, 'Time'), h('th', null, 'Acct'), h('th', null, 'Action'), h('th', null, 'Detail'))
        ));
        var tbody = h('tbody', null);
        res.entries.slice(-10).forEach(function(e) {
          tbody.appendChild(h('tr', null,
            h('td', null, e.time || ''),
            h('td', null, (e.account || '').slice(-4)),
            h('td', null, e.action || ''),
            h('td', null, e.detail || '')
          ));
        });
        table.appendChild(tbody);
        var scroll = h('div', { cls: 'scr-scroll' });
        scroll.appendChild(table);
        self.setScreen([
          h('div', { cls: 'scr-admin-title' }, 'AUDIT LOG'),
          makeDivider(), scroll, makeBackRow('Back'),
        ]);
      }
    }).catch(function() {
      self.setScreen([
        h('div', { cls: 'scr-admin-title' }, 'AUDIT LOG'),
        makeDivider(), h('div', { cls: 'scr-error-line' }, 'Failed to load'),
        makeSpacer(), makeBackRow('Back'),
      ]);
    });
  },

  renderAdminCassettes: function() {
    var self = this;
    this.setSideButtons({
      L1: { label: 'Refill All', fn: function() {
        Object.keys(self.cassettes).forEach(function(d) {
          self.cassettes[d].count = self.cassettes[d].max;
        });
        self.updateCassetteDisplay();
        ATMSound.successChime();
        self.goto('ADMIN_CASS');
      }},
      R4: { label: 'Back', fn: function() { self.goto('ADMIN_MENU'); } }
    });
    var rows = [];
    var self2 = this;
    [50, 20, 10, 5].forEach(function(d) {
      var c = self2.cassettes[d];
      var pct = Math.round((c.count / c.max) * 100);
      var bar = '';
      var filled = Math.round(pct / 5);
      for (var i = 0; i < 20; i++) bar += i < filled ? '\u2588' : '\u2591';
      rows.push(h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' },
        '\u00a3' + d + '  ' + bar + ' ' + c.count + '/' + c.max));
    });
    var content = [
      h('div', { cls: 'scr-admin-title' }, 'CASSETTE LEVELS'),
      makeDivider(),
    ];
    rows.forEach(function(r) { content.push(r); });
    content.push(makeSpacer());
    content.push(makeBtnRows([
      { left: 'Refill All', right: '' },
      { left: '', right: '' }, { left: '', right: '' },
      { left: '', right: 'Back' },
    ]));
    this.setScreen(content);
  },

  renderAdminAccounts: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('ADMIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-admin-title' }, 'ACCOUNTS'),
      makeDivider(),
      h('div', { cls: 'scr-loading', style: 'color:#ffd700;' }, 'Loading...'),
      makeSpacer(), makeBackRow('Back'),
    ]);
    ATMAPI.getAccounts().then(function(res) {
      if (res.status === 'ok' && res.accounts) {
        var table = h('table', { cls: 'scr-admin-table' });
        table.appendChild(h('thead', null,
          h('tr', null, h('th', null, 'Acct'), h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, 'Balance'), h('th', null, 'St'))
        ));
        var tbody = h('tbody', null);
        res.accounts.forEach(function(a) {
          tbody.appendChild(h('tr', null,
            h('td', null, (a.account || '').slice(-4)),
            h('td', null, (a.first_name || '').trim()),
            h('td', null, a.type || ''),
            h('td', null, '\u00a3' + (a.balance || '0')),
            h('td', { style: a.status === 'Locked' ? 'color:#ff4444;' : '' }, a.status === 'Locked' ? 'L' : 'A')
          ));
        });
        table.appendChild(tbody);
        var scroll = h('div', { cls: 'scr-scroll' });
        scroll.appendChild(table);
        self.setScreen([
          h('div', { cls: 'scr-admin-title' }, 'ACCOUNTS'),
          makeDivider(), scroll, makeBackRow('Back'),
        ]);
      }
    }).catch(function() {
      self.setScreen([
        h('div', { cls: 'scr-admin-title' }, 'ACCOUNTS'),
        makeDivider(), h('div', { cls: 'scr-error-line' }, 'Failed to load'),
        makeSpacer(), makeBackRow('Back'),
      ]);
    });
  },

  renderAdminTranslog: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('ADMIN_MENU'); } }
    });
    this.setScreen([
      h('div', { cls: 'scr-admin-title' }, 'TRANSACTION LOG'),
      makeDivider(),
      h('div', { cls: 'scr-loading', style: 'color:#ffd700;' }, 'Loading...'),
      makeSpacer(), makeBackRow('Back'),
    ]);
    ATMAPI.getTransLog().then(function(res) {
      if (res.status === 'ok' && res.transactions) {
        var table = h('table', { cls: 'scr-admin-table' });
        table.appendChild(h('thead', null,
          h('tr', null, h('th', null, 'Date'), h('th', null, 'Acct'), h('th', null, 'Type'), h('th', null, 'Amount'))
        ));
        var tbody = h('tbody', null);
        res.transactions.slice(-10).forEach(function(t) {
          tbody.appendChild(h('tr', null,
            h('td', null, t.date || ''),
            h('td', null, (t.account || '').slice(-4)),
            h('td', null, (t.type || '').trim()),
            h('td', null, '\u00a3' + (t.amount || '0'))
          ));
        });
        table.appendChild(tbody);
        var scroll = h('div', { cls: 'scr-scroll' });
        scroll.appendChild(table);
        self.setScreen([
          h('div', { cls: 'scr-admin-title' }, 'TRANSACTION LOG'),
          makeDivider(), scroll, makeBackRow('Back'),
        ]);
      }
    }).catch(function() {
      self.setScreen([
        h('div', { cls: 'scr-admin-title' }, 'TRANSACTION LOG'),
        makeDivider(), h('div', { cls: 'scr-error-line' }, 'Failed to load'),
        makeSpacer(), makeBackRow('Back'),
      ]);
    });
  },

  renderAdminStatus: function() {
    var self = this;
    this.setSideButtons({
      R4: { label: 'Back', fn: function() { self.goto('ADMIN_MENU'); } }
    });
    var totalNotes = 0;
    var cassInfo = [];
    [50, 20, 10, 5].forEach(function(d) {
      totalNotes += self.cassettes[d].count;
      cassInfo.push('\u00a3' + d + ': ' + self.cassettes[d].count);
    });
    this.setScreen([
      h('div', { cls: 'scr-admin-title' }, 'SYSTEM STATUS'),
      makeDivider(),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:4px 0;' }, 'ATM ID: CNB-ATM-001'),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' }, 'Location: London EC2'),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' }, 'Status: ONLINE'),
      h('div', { cls: 'scr-label', style: 'color:#44ff44;font-size:11px;margin:2px 0;' }, 'COBOL Engine: ACTIVE'),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' }, 'Notes loaded: ' + totalNotes),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' }, 'API calls: ' + ATMAPI.commandLog.length),
      h('div', { cls: 'scr-label', style: 'color:#ffd700;font-size:11px;margin:2px 0;' },
        'Uptime: ' + Math.floor(performance.now() / 60000) + 'm'),
      makeSpacer(), makeBackRow('Back'),
    ]);
  },

  /* ══════════════════════════════════════════════════════════════════
     Card Animation
     ══════════════════════════════════════════════════════════════════ */
  animateCardInsert: function() {
    var card = this.dom.debitCard;
    if (!card) return;
    card.classList.remove('ejecting', 'inserting');
    void card.offsetWidth;
    card.classList.add('inserting');
    /* LED active during insert */
    this.dom.cardLed.classList.add('active');
    ATMSound.cardMotor();
    var self = this;
    setTimeout(function() {
      card.classList.remove('inserting');
      card.style.opacity = '0';
      self.dom.cardLed.classList.remove('active');
    }, 1800);
  },

  animateCardEject: function() {
    var card = this.dom.debitCard;
    if (!card) return;
    card.classList.remove('inserting', 'ejecting');
    card.style.opacity = '';
    void card.offsetWidth;
    card.classList.add('ejecting');
    this.dom.cardLed.classList.add('active');
    var self = this;
    setTimeout(function() {
      card.classList.remove('ejecting');
      card.style.opacity = '0';
      self.dom.cardLed.classList.remove('active');
    }, 2000);
  },

  /* ══════════════════════════════════════════════════════════════════
     UK Note Dispensing
     ══════════════════════════════════════════════════════════════════ */
  splitDenominations: function(amount) {
    var amt = Math.round(amount);
    if (amt <= 0 || amt % 5 !== 0) return null;
    var denoms = [50, 20, 10, 5];
    var notes = [];
    var remaining = amt;
    var self = this;
    for (var i = 0; i < denoms.length; i++) {
      var d = denoms[i];
      while (remaining >= d && self.cassettes[d].count > notes.filter(function(n) { return n === d; }).length) {
        notes.push(d);
        remaining -= d;
      }
    }
    return remaining === 0 ? notes : null;
  },

  dispenseNotes: function(notes) {
    var container = this.dom.notesContainer;
    if (!container) return;
    /* Clear previous notes */
    while (container.firstChild) container.removeChild(container.firstChild);
    notes.forEach(function(denom, i) {
      var note = document.createElement('div');
      note.className = 'banknote note-' + denom;
      note.style.animationDelay = (i * 0.25) + 's';
      var val = document.createElement('span');
      val.className = 'note-value';
      val.textContent = '\u00a3' + denom;
      note.appendChild(val);
      /* Slight random rotation for realism */
      var rot = (Math.random() - 0.5) * 4;
      note.style.transform = 'rotate(' + rot + 'deg)';
      note.classList.add('dispensing');
      container.appendChild(note);
    });
  },

  collectNotes: function() {
    var container = this.dom.notesContainer;
    if (!container) return;
    var notes = container.querySelectorAll('.banknote');
    notes.forEach(function(note, i) {
      note.classList.remove('dispensing');
      note.classList.add('collecting');
      note.style.animationDelay = (i * 0.1) + 's';
    });
    setTimeout(function() {
      while (container.firstChild) container.removeChild(container.firstChild);
    }, 800);
  },

  updateCassetteDisplay: function() {
    var indicators = document.getElementById('cassetteIndicators');
    if (!indicators) return;
    var self = this;
    [50, 20, 10, 5].forEach(function(d) {
      var bar = indicators.querySelector('[data-denom="' + d + '"] .fill');
      if (!bar) return;
      var c = self.cassettes[d];
      var pct = (c.count / c.max) * 100;
      bar.style.height = pct + '%';
      bar.className = 'fill ' + (pct > 40 ? 'full' : pct > 15 ? 'mid' : 'low');
    });
  },

  /* ══════════════════════════════════════════════════════════════════
     Receipt Printing
     ══════════════════════════════════════════════════════════════════ */
  printReceipt: function(data) {
    var paper = this.dom.receiptPaper;
    if (!paper) return;
    clearTimeout(this._receiptTimer);
    paper.classList.remove('printing', 'tearing', 'retracting');
    while (paper.firstChild) paper.removeChild(paper.firstChild);

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-GB');
    var timeStr = now.toLocaleTimeString('en-GB');

    var lines = [
      '========================',
      ' COBOL NATIONAL BANK',
      '   ATM Receipt',
      '========================',
      ' Date: ' + dateStr,
      ' Time: ' + timeStr,
      ' Acct: ******' + (this.account || '????').slice(-4),
      '',
    ];

    if (data.type === 'BALANCE') {
      lines.push(' BALANCE ENQUIRY');
      lines.push(' Balance: \u00a3' + this.formatAmount(data.balance));
    } else if (data.type === 'WITHDRAWAL') {
      lines.push(' CASH WITHDRAWAL');
      lines.push(' Amount:  \u00a3' + this.formatAmount(data.amount));
      lines.push(' Balance: \u00a3' + this.formatAmount(data.balance));
    } else if (data.type === 'DEPOSIT') {
      lines.push(' DEPOSIT');
      lines.push(' Amount:  \u00a3' + this.formatAmount(data.amount));
      lines.push(' Balance: \u00a3' + this.formatAmount(data.balance));
    } else if (data.type === 'TRANSFER') {
      lines.push(' TRANSFER');
      lines.push(' To: ' + (data.dest || '').slice(-4));
      lines.push(' Amount:  \u00a3' + this.formatAmount(data.amount));
      lines.push(' Balance: \u00a3' + this.formatAmount(data.balance));
    } else if (data.type === 'STATEMENT') {
      lines.push(' MINI STATEMENT');
      (data.transactions || []).forEach(function(t) {
        lines.push(' ' + (t.date || '') + ' ' + (t.type || '').substring(0, 6) + ' \u00a3' + (t.amount || ''));
      });
    }

    lines.push('');
    lines.push('========================');
    lines.push(' Thank you for banking');
    lines.push('   with us');
    lines.push('========================');

    var textWrap = document.createElement('div');
    textWrap.className = 'receipt-text';
    lines.forEach(function(line, i) {
      var span = document.createElement('div');
      span.className = 'receipt-line';
      span.textContent = line;
      span.style.animationDelay = (i * 0.06) + 's';
      textWrap.appendChild(span);
    });
    paper.appendChild(textWrap);

    ATMSound.receiptPrint(lines.length * 0.06);

    void paper.offsetWidth;
    paper.classList.add('printing');

    var self = this;
    this._receiptTimer = setTimeout(function() {
      self.retractReceipt();
    }, 12000);
  },

  tearReceipt: function() {
    var paper = this.dom.receiptPaper;
    if (!paper || !paper.classList.contains('printing')) return;
    clearTimeout(this._receiptTimer);
    paper.classList.remove('printing');
    paper.classList.add('tearing');
    setTimeout(function() {
      paper.classList.remove('tearing');
      paper.style.maxHeight = '0';
      paper.style.padding = '0';
      while (paper.firstChild) paper.removeChild(paper.firstChild);
      setTimeout(function() { paper.style.maxHeight = ''; paper.style.padding = ''; }, 100);
    }, 500);
  },

  retractReceipt: function() {
    var paper = this.dom.receiptPaper;
    if (!paper) return;
    clearTimeout(this._receiptTimer);
    paper.classList.remove('printing');
    paper.classList.add('retracting');
    setTimeout(function() {
      paper.classList.remove('retracting');
      while (paper.firstChild) paper.removeChild(paper.firstChild);
    }, 800);
  },

  /* ══════════════════════════════════════════════════════════════════
     Session Timeout
     ══════════════════════════════════════════════════════════════════ */
  startTimeout: function() {
    var self = this;
    this._sessionActive = true;
    this.timeoutRemaining = this.timeoutDuration;
    var bar = this.dom.timeoutBar;
    if (bar) {
      bar.classList.add('active');
      bar.classList.remove('warning', 'critical');
      bar.style.width = '100%';
    }
    clearInterval(this._timeoutInterval);
    this._timeoutInterval = setInterval(function() {
      self.timeoutRemaining--;
      if (bar) {
        var pct = (self.timeoutRemaining / self.timeoutDuration) * 100;
        bar.style.width = pct + '%';
        bar.classList.toggle('warning', self.timeoutRemaining <= 15 && self.timeoutRemaining > 5);
        bar.classList.toggle('critical', self.timeoutRemaining <= 5);
      }
      if (self.timeoutRemaining <= 0) {
        self.sessionTimedOut();
      }
    }, 1000);
  },

  resetTimeout: function() {
    if (!this._sessionActive) return;
    this.timeoutRemaining = this.timeoutDuration;
    var bar = this.dom.timeoutBar;
    if (bar) {
      bar.style.width = '100%';
      bar.classList.remove('warning', 'critical');
    }
  },

  stopTimeout: function() {
    this._sessionActive = false;
    clearInterval(this._timeoutInterval);
    var bar = this.dom.timeoutBar;
    if (bar) {
      bar.classList.remove('active', 'warning', 'critical');
      bar.style.width = '100%';
    }
  },

  sessionTimedOut: function() {
    this.stopTimeout();
    ATMSound.errorBuzz();
    this.showTempMessage('SESSION TIMED OUT\nCard ejected for security', 'error', 3000, function() {
      ATM.goto('GOODBYE');
    });
  },

  /* ══════════════════════════════════════════════════════════════════
     Live Clock
     ══════════════════════════════════════════════════════════════════ */
  updateClock: function() {
    var el = this.dom.atmClock;
    if (!el) return;
    var now = new Date();
    el.textContent = now.toLocaleTimeString('en-GB');
  },

  /* ══════════════════════════════════════════════════════════════════
     COBOL Command Visualiser
     ══════════════════════════════════════════════════════════════════ */
  addCobolEntry: function(entry) {
    var log = this.dom.cobolLog;
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'cobol-entry' + (entry.success ? '' : ' error');

    var time = document.createElement('div');
    time.className = 'cmd-time';
    time.textContent = entry.time;
    div.appendChild(time);

    var cmd = document.createElement('div');
    cmd.className = 'cmd-text';
    cmd.textContent = '> ' + entry.command;
    div.appendChild(cmd);

    var resp = document.createElement('div');
    resp.className = 'cmd-response';
    resp.textContent = '< ' + entry.response;
    div.appendChild(resp);

    var elapsed = document.createElement('div');
    elapsed.className = 'cmd-elapsed';
    elapsed.textContent = entry.elapsed + 'ms';
    div.appendChild(elapsed);

    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  },

  /* ══════════════════════════════════════════════════════════════════
     Processing Indicator (shows COBOL command on screen)
     ══════════════════════════════════════════════════════════════════ */
  showProcessing: function(cobolCmd) {
    this.setSideButtons({});
    var proc = h('div', { cls: 'scr-processing' },
      h('div', null, 'CORE BANKING PROCESSING'),
      h('div', { cls: 'cobol-cmd' }, '> ' + cobolCmd),
      h('div', { style: 'margin-top:8px;animation:pulse 0.8s infinite;' }, '\u2588\u2591\u2588\u2591\u2588')
    );
    this.setScreen([makeSpacer(), proc, makeSpacer()]);
  },

  /* ══════════════════════════════════════════════════════════════════
     Utilities
     ══════════════════════════════════════════════════════════════════ */
  showTempMessage: function(msg, type, duration, cb) {
    var self = this;
    var cls = type === 'error' ? 'scr-error-line' : 'scr-success-line';
    this.setSideButtons({});
    this.setScreen([
      makeSpacer(),
      h('div', { cls: cls, style: 'font-size:14px;padding:10px;white-space:pre-line;' }, msg),
      makeSpacer(),
    ]);
    setTimeout(function() {
      if (typeof cb === 'function') cb();
      else self.render();
    }, duration || 2000);
  },

  showLoading: function(msg) {
    this.setSideButtons({});
    this.setScreen([
      makeSpacer(),
      h('div', { cls: 'scr-loading' }, msg || 'Please wait...'),
      makeSpacer(),
    ]);
  },

  formatAmount: function(val) {
    var n = parseFloat(val);
    if (isNaN(n)) return String(val || '0.00');
    return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /* ══════════════════════════════════════════════════════════════════
     Demo Mode — Auto-scripted sequence for video recording
     ══════════════════════════════════════════════════════════════════ */
  toggleDemo: function() {
    if (this.demoRunning) {
      this._demoAbort = true;
      this.demoRunning = false;
      var btn = document.getElementById('demoBtn');
      if (btn) { btn.textContent = '\u25b6 DEMO'; btn.classList.remove('active'); }
      var bar = document.getElementById('demoProgress');
      if (bar) bar.style.width = '0';
      return;
    }
    this.demoRunning = true;
    this._demoAbort = false;
    var btn2 = document.getElementById('demoBtn');
    if (btn2) { btn2.textContent = '\u25a0 STOP'; btn2.classList.add('active'); }
    /* Init sound on user gesture */
    ATMSound.init();
    ATMSound.startHum();
    var soundBtn = document.getElementById('soundBtn');
    if (soundBtn) { soundBtn.textContent = '\u{1f50a}'; soundBtn.classList.add('active'); }
    this.runDemo();
  },

  runDemo: function() {
    var self = this;
    var steps = [
      /* Reset to start */
      function(next) { self.goto('INSERT_CARD'); setTimeout(next, 1000); },
      /* Type account number */
      function(next) { self.demoType('1000000001', next); },
      function(next) { setTimeout(next, 500); },
      /* Press enter */
      function(next) { self.demoPress('enter'); setTimeout(next, 2200); },
      /* Type PIN */
      function(next) { self.demoType('1234', next); },
      function(next) { setTimeout(next, 500); },
      /* Press enter to login */
      function(next) { self.demoPress('enter'); setTimeout(next, 2000); },
      /* Check balance (L1) */
      function(next) { self.demoSideBtn('L1'); setTimeout(next, 3000); },
      /* Back to menu (R4) */
      function(next) { self.demoSideBtn('R4'); setTimeout(next, 1500); },
      /* Withdraw £50 (L2 then L2) */
      function(next) { self.demoSideBtn('L2'); setTimeout(next, 1500); },
      function(next) { self.demoSideBtn('L2'); setTimeout(next, 4000); },
      /* Back to menu */
      function(next) { self.demoSideBtn('R4'); setTimeout(next, 1500); },
      /* Mini statement (L3) */
      function(next) { self.demoSideBtn('L3'); setTimeout(next, 3500); },
      /* Back to menu */
      function(next) { self.demoSideBtn('R4'); setTimeout(next, 1500); },
      /* Logout (R4) */
      function(next) { self.demoSideBtn('R4'); setTimeout(next, 4000); },
    ];

    var total = steps.length;
    var current = 0;
    var bar = document.getElementById('demoProgress');

    function runStep() {
      if (self._demoAbort || current >= steps.length) {
        self.demoRunning = false;
        self._demoAbort = false;
        var btn = document.getElementById('demoBtn');
        if (btn) { btn.textContent = '\u25b6 DEMO'; btn.classList.remove('active'); }
        if (bar) bar.style.width = '0';
        return;
      }
      if (bar) bar.style.width = ((current / total) * 100) + '%';
      steps[current](function() { current++; runStep(); });
    }
    runStep();
  },

  demoType: function(digits, cb) {
    var self = this;
    var i = 0;
    function typeNext() {
      if (self._demoAbort || i >= digits.length) { if (cb) cb(); return; }
      var d = digits[i];
      var btn = document.querySelector('.pin-key[data-key="' + d + '"]');
      if (btn) self.flashBtn(btn);
      ATMSound.beep();
      self.handleDigit(d);
      i++;
      setTimeout(typeNext, 200 + Math.random() * 150);
    }
    typeNext();
  },

  demoPress: function(key) {
    var sel = key === 'enter' ? '.pin-key.enter-key' : '.pin-key[data-key="' + key + '"]';
    var btn = document.querySelector(sel);
    if (btn) this.flashBtn(btn);
    ATMSound.beep();
    this.handlePinKey(key);
  },

  demoSideBtn: function(pos) {
    this.flashBtn(this.dom['btn' + pos]);
    ATMSound.beep();
    this.handleSideButton(pos);
  },

  /* ══════════════════════════════════════════════════════════════════
     "Show me the stack" Overlay
     ══════════════════════════════════════════════════════════════════ */
  showStack: function() {
    var overlay = document.getElementById('stackOverlay');
    if (overlay) overlay.classList.add('visible');
  },
};

/* Make ATM globally accessible for ATMAPI reference */
window.ATM = ATM;

/* ── Bootstrap ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() { ATM.init(); });
