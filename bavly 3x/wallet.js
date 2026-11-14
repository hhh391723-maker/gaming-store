/* =====================================================================
   wallet.js — المحفظة (شحن رصيد تجريبي) + الشراء من الرصيد
   - بيحط أيقونة المحفظة جنب الظرف تلقائياً في أي صفحة فيها .msg-icon-wrap
   - لازم يتحمّل بعد firebase-app و firebase-firestore
   - API:  Wallet.open({amount, onDone}) · Wallet.buy(game, packId, packData?)
           Wallet.balance() · Wallet.refresh() · Wallet.onLivePacks(ids)
   ⚠ كل الفلوس هنا تجريبية — مفيش أي سحب حقيقي من أي حساب أو بطاقة.
   ===================================================================== */
(function () {
  'use strict';
  if (window.Wallet) return;

  const firebaseConfig = {
    apiKey: "AIzaSyB3E9e2aFVgrpTm0df7tC_YKskT-MA3h0s",
    authDomain: "my-pes-shop.firebaseapp.com",
    projectId: "my-pes-shop",
    storageBucket: "my-pes-shop.firebasestorage.app",
    messagingSenderId: "438807292964",
    appId: "1:438807292964:web:38709635a02d9e1bd8bcb1"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const fdb = firebase.firestore();
  const SERVER_TS = () => firebase.firestore.FieldValue.serverTimestamp();

  const MIN_TOPUP = 10, MAX_TOPUP = 10000, MAX_BALANCE = 100000;
  const CHIPS = [50, 100, 200, 500, 1000];
  const GAME_IMG = g => 'assets/imgs/' + g + '.png';

  /* ---------- أدوات ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const toLatin = s => String(s || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/٫/g, '.').replace(/٬/g, ',');
  const digits = s => toLatin(s).replace(/\D/g, '');
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => {
    n = Number(n) || 0;
    return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  function luhn(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = parseInt(num[i], 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function parsePrice(s) {
    const t = toLatin(s).replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
    const m = t.match(/\d+(?:[.,]\d+)?/);
    if (!m) return NaN;
    return parseFloat(m[0].replace(',', '.'));
  }
  const uid = () => localStorage.getItem('userEmail') || localStorage.getItem('userName') || 'guest';
  const isLogged = () => !!localStorage.getItem('userName');
  const isTrustedUser = () => localStorage.getItem('userRole') === 'trusted';
  const walletRef = () => fdb.collection('wallets').doc(uid().replace(/\//g, '_'));
  const rnd = (chars, n) => { let s = ''; for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; };
  const orderId = () => 'BV-' + rnd('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
  const opId = () => 'TX-' + rnd('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tsMs = d => (d && d.timestamp && d.timestamp.toMillis) ? d.timestamp.toMillis() : Date.now();

  function toast(msg, type) {
    let t = document.getElementById('siteToast');
    if (!t) { t = document.createElement('div'); t.id = 'siteToast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'site-toast show' + (type ? ' ' + type : '');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  const ICON_WALLET = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>';

  /* ---------- طرق الدفع ---------- */
  const METHODS = {
    vodafone: { name: 'فودافون كاش', glyph: '📲', color: '#e60000', kind: 'wallet', prefix: '010', hint: 'رقم فودافون كاش (يبدأ بـ 010)' },
    orange:   { name: 'أورنج كاش',   glyph: '🍊', color: '#ff7900', kind: 'wallet', prefix: '012', hint: 'رقم أورنج كاش (يبدأ بـ 012)' },
    etisalat: { name: 'اتصالات كاش', glyph: '📶', color: '#4caf50', kind: 'wallet', prefix: '011', hint: 'رقم اتصالات كاش (يبدأ بـ 011)' },
    fawry:    { name: 'فوري',        glyph: '🧾', color: '#f5c400', kind: 'wallet', prefix: null,  hint: 'رقم الموبايل المسجل في فوري' },
    instapay: { name: 'إنستاباي',    glyph: '⚡', color: '#7c3aed', kind: 'instapay' },
    visa:     { name: 'فيزا / ماستركارد', glyph: '💳', color: '#2563eb', kind: 'card' }
  };

  /* ---------- حالة الرصيد (لحظية) ---------- */
  const S = { balance: null, error: false, unsub: null, boundId: null };
  const balListeners = new Set();

  function bindBalance() {
    const id = isLogged() && !isTrustedUser() ? uid() : null;
    if (id === S.boundId) return;
    if (S.unsub) { S.unsub(); S.unsub = null; }
    S.boundId = id; S.balance = null; S.error = false;
    paintPill(false);
    if (!id) return;
    S.unsub = walletRef().onSnapshot(snap => {
      const old = S.balance;
      S.balance = snap.exists ? round2(Number(snap.data().balance) || 0) : 0;
      S.error = false;
      paintPill(old !== null && old !== S.balance);
      balListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    }, err => {
      console.error('wallet', err);
      S.error = true; paintPill(false);
    });
  }

  /* ---------- الأيقونة جنب الظرف ---------- */
  function mountButton() {
    if (document.getElementById('walletBtn')) return;
    const env = $('.msg-icon-wrap');
    if (!env) return;
    const btn = document.createElement('button');
    btn.id = 'walletBtn'; btn.type = 'button'; btn.className = 'wallet-btn'; btn.title = 'المحفظة';
    btn.innerHTML = ICON_WALLET + '<span class="wallet-amt" id="walletAmt">—</span>';
    btn.addEventListener('click', () => openWallet());
    const parent = env.parentElement;
    if (parent && parent.tagName === 'HEADER') {
      const wrap = document.createElement('div');
      wrap.className = 'hdr-actions';
      parent.insertBefore(wrap, env);
      wrap.appendChild(btn); wrap.appendChild(env);
    } else {
      parent.insertBefore(btn, env);
    }
  }
  function paintPill(bump) {
    const btn = document.getElementById('walletBtn');
    if (!btn) return;
    const show = isLogged() && !isTrustedUser();
    btn.style.display = show ? '' : 'none';
    const amt = document.getElementById('walletAmt');
    if (!amt) return;
    amt.textContent = S.error ? '!' : (S.balance === null ? '…' : fmt(S.balance));
    if (bump) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
  }

  /* ---------- هيكل المودالات ---------- */
  function lockScroll() { document.body.classList.add('modal-open'); }
  function unlockScroll() {
    if (!$('.wmodal.open')) document.body.classList.remove('modal-open');
  }
  function makeModal(id, titleId) {
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id; m.className = 'wmodal';
    m.innerHTML = `
      <div class="wsheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="wgrab"></div>
        <div class="whead">
          <button type="button" class="wicon-btn" data-w="back" aria-label="رجوع" style="visibility:hidden">›</button>
          <h3 id="${titleId}"></h3>
          <button type="button" class="wicon-btn" data-w="close" aria-label="إغلاق">✕</button>
        </div>
        <div class="wbody"></div>
      </div>`;
    document.body.appendChild(m);
    return m;
  }

  /* =====================================================================
     1) مودال المحفظة (شحن)
     ===================================================================== */
  const W = { step: 'main', amount: 0, method: null, number: '', card: { num: '', exp: '', cvv: '', name: '' },
              otp: '', otpExp: 0, otpSent: 0, attempts: 0, busy: false, onDone: null, timer: null };
  let wm = null;

  function wEls() {
    wm = makeModal('walletModal', 'wTitle');
    return { m: wm, title: $('#wTitle', wm), body: $('.wbody', wm), back: $('[data-w="back"]', wm), close: $('[data-w="close"]', wm) };
  }

  function openWallet(opts) {
    opts = opts || {};
    if (!isLogged()) { toast('سجل دخولك الأول عشان تشحن المحفظة', 'error'); setTimeout(() => { location.href = 'index.html'; }, 1200); return; }
    if (isTrustedUser()) { toast('حساب التراستيد مالوش محفظة', 'error'); return; }
    bindBalance();
    const e = wEls();
    if (!e.m._bound) {
      e.m._bound = true;
      e.close.addEventListener('click', closeWallet);
      e.back.addEventListener('click', walletBack);
      e.m.addEventListener('click', ev => { if (ev.target === e.m) closeWallet(); });
    }
    let last = null;
    try { last = localStorage.getItem('walletLastMethod'); } catch (_) {}
    W.step = 'main';
    W.amount = Math.min(MAX_TOPUP, Math.max(0, Math.ceil(Number(opts.amount) || 0)));
    W.method = METHODS[last] ? last : null;
    W.number = digits(localStorage.getItem('userPhone') || '');
    W.card = { num: '', exp: '', cvv: '', name: '' };
    W.otp = ''; W.attempts = 0; W.busy = false; W.onDone = opts.onDone || null;
    e.m.classList.add('open'); lockScroll();
    renderWallet();
  }
  function closeWallet() {
    if (W.busy) return;
    clearInterval(W.timer);
    if (wm) wm.classList.remove('open');
    unlockScroll();
  }
  function walletBack() {
    if (W.busy) return;
    clearInterval(W.timer);
    if (W.step === 'details' || W.step === 'history') W.step = 'main';
    else if (W.step === 'otp') W.step = 'details';
    renderWallet();
  }

  function setHeader(title, canBack) {
    const e = wEls();
    e.title.textContent = title;
    e.back.style.visibility = canBack ? 'visible' : 'hidden';
    e.close.style.visibility = W.busy ? 'hidden' : 'visible';
  }

  function renderWallet() {
    const body = $('.wbody', wm);
    body.scrollTop = 0;
    switch (W.step) {
      case 'main': return renderMain(body);
      case 'details': return renderDetails(body);
      case 'otp': return renderOtp(body);
      case 'busy': return renderBusy(body);
      case 'done': return renderDone(body);
      case 'history': return renderHistory(body);
    }
  }

  function balanceCard() {
    return `
      <div class="wcard">
        <div class="wcard-shine"></div>
        <div class="wcard-top"><span>رصيد المحفظة</span><span class="wtag">تجريبي</span></div>
        <div class="wcard-bal"><b id="wBalNum">${S.balance === null ? '…' : fmt(S.balance)}</b><small>جنيه</small></div>
        <div class="wcard-bot"><span>${esc(localStorage.getItem('userName') || '')}</span>
          <button type="button" class="wlink" id="wHist">سجل العمليات ‹</button></div>
      </div>`;
  }

  /* --- الخطوة 1: المبلغ + الطريقة --- */
  function renderMain(body) {
    setHeader('شحن المحفظة', false);
    body.innerHTML = `
      ${balanceCard()}
      <h4 class="wlabel">كام تحب تشحن؟</h4>
      <div class="wchips">${CHIPS.map(c => `<button type="button" class="wchip" data-amt="${c}">${fmt(c)}</button>`).join('')}</div>
      <div class="wamount">
        <button type="button" class="wstep" id="wMinus" aria-label="أقل">−</button>
        <input id="wAmt" inputmode="numeric" placeholder="اكتب مبلغ تاني" autocomplete="off" value="${W.amount || ''}">
        <span class="wunit">جنيه</span>
        <button type="button" class="wstep" id="wPlus" aria-label="أكتر">+</button>
      </div>
      <div class="wnote" id="wAmtNote"></div>
      <h4 class="wlabel">اختار طريقة الدفع</h4>
      <div class="wmethods">
        ${Object.keys(METHODS).map(k => {
          const m = METHODS[k];
          return `<button type="button" class="wmethod${W.method === k ? ' active' : ''}" data-m="${k}" style="--mc:${m.color}">
            <span class="wm-glyph">${m.glyph}</span><span class="wm-name">${esc(m.name)}</span></button>`;
        }).join('')}
      </div>
      <button type="button" class="wprimary" id="wNext" disabled>متابعة</button>
      <p class="wfine">🔒 وضع تجريبي: مفيش أي مبلغ حقيقي بيتسحب من أي حساب أو بطاقة.</p>`;

    const amtEl = $('#wAmt', body), next = $('#wNext', body), note = $('#wAmtNote', body);
    const sync = () => {
      const a = W.amount;
      body.querySelectorAll('.wchip').forEach(c => c.classList.toggle('active', Number(c.dataset.amt) === a));
      let msg = '';
      if (a && a < MIN_TOPUP) msg = 'أقل مبلغ للشحن ' + MIN_TOPUP + ' جنيه';
      else if (a > MAX_TOPUP) msg = 'أقصى مبلغ في العملية الواحدة ' + fmt(MAX_TOPUP) + ' جنيه';
      else if (S.balance !== null && a && S.balance + a > MAX_BALANCE) msg = 'الرصيد الكلي مينفعش يعدّي ' + fmt(MAX_BALANCE) + ' جنيه';
      note.textContent = msg; note.classList.toggle('err', !!msg);
      const ok = a >= MIN_TOPUP && a <= MAX_TOPUP && !msg && !!W.method;
      next.disabled = !ok;
      next.textContent = ok ? 'متابعة — شحن ' + fmt(a) + ' جنيه' : (!W.method && a >= MIN_TOPUP ? 'اختار طريقة الدفع' : 'متابعة');
    };
    const setAmt = (v, fromInput) => {
      W.amount = Math.max(0, Math.min(v, MAX_TOPUP + 1));
      if (!fromInput) amtEl.value = W.amount || '';
      sync();
    };
    body.querySelectorAll('.wchip').forEach(c => c.addEventListener('click', () => setAmt(Number(c.dataset.amt))));
    amtEl.addEventListener('input', () => {
      const d = digits(amtEl.value).slice(0, 6);
      amtEl.value = d; setAmt(parseInt(d || '0', 10), true);
    });
    $('#wMinus', body).addEventListener('click', () => setAmt(Math.max(0, (W.amount || 0) - 50)));
    $('#wPlus', body).addEventListener('click', () => setAmt(Math.min(MAX_TOPUP, (W.amount || 0) + 50)));
    body.querySelectorAll('.wmethod').forEach(b => b.addEventListener('click', () => {
      W.method = b.dataset.m;
      body.querySelectorAll('.wmethod').forEach(x => x.classList.toggle('active', x === b));
      sync();
    }));
    $('#wHist', body).addEventListener('click', () => { W.step = 'history'; renderWallet(); });
    next.addEventListener('click', () => { if (!next.disabled) { W.step = 'details'; renderWallet(); } });
    const live = () => { const n = $('#wBalNum', body); if (n) n.textContent = S.balance === null ? '…' : fmt(S.balance); sync(); };
    balListeners.delete(W._live); W._live = live; balListeners.add(live);
    sync();
  }

  /* --- الخطوة 2: بيانات الدفع --- */
  function summaryBox() {
    const m = METHODS[W.method];
    const after = (S.balance || 0) + W.amount;
    return `
      <div class="wsum">
        <div><span>المبلغ</span><b>${fmt(W.amount)} جنيه</b></div>
        <div><span>طريقة الدفع</span><b>${m.glyph} ${esc(m.name)}</b></div>
        <div class="total"><span>رصيدك بعد الشحن</span><b>${fmt(after)} جنيه</b></div>
      </div>`;
  }
  function renderDetails(body) {
    const m = METHODS[W.method];
    setHeader('بيانات ' + m.name, true);
    let form = '';
    if (m.kind === 'wallet') {
      form = `<label class="wfield"><span>${esc(m.hint)}</span>
        <input id="wNum" class="wi ltr" inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX" autocomplete="tel" value="${esc(W.number)}"></label>`;
    } else if (m.kind === 'instapay') {
      form = `<label class="wfield"><span>عنوان إنستاباي أو رقم الموبايل</span>
        <input id="wNum" class="wi ltr" placeholder="name@instapay أو 01XXXXXXXXX" autocomplete="off" value="${esc(W.number)}"></label>`;
    } else {
      form = `
        <div class="ccard" id="ccard">
          <div class="cc-chip"></div><div class="cc-brand" id="ccBrand">CARD</div>
          <div class="cc-num" id="ccNum">•••• •••• •••• ••••</div>
          <div class="cc-row"><span id="ccName">اسم حامل البطاقة</span><span id="ccExp">MM/YY</span></div>
        </div>
        <label class="wfield"><span>رقم البطاقة</span>
          <input id="cNum" class="wi ltr" inputmode="numeric" maxlength="23" placeholder="0000 0000 0000 0000" autocomplete="cc-number"></label>
        <label class="wfield"><span>الاسم على البطاقة</span>
          <input id="cName" class="wi ltr" placeholder="NAME SURNAME" autocomplete="cc-name"></label>
        <div class="wrow2">
          <label class="wfield"><span>تاريخ الانتهاء</span><input id="cExp" class="wi ltr" inputmode="numeric" maxlength="5" placeholder="MM/YY" autocomplete="cc-exp"></label>
          <label class="wfield"><span>CVV</span><input id="cCvv" class="wi ltr" inputmode="numeric" maxlength="4" placeholder="•••" autocomplete="cc-csc"></label>
        </div>
        <div class="wnote">للتجربة: <button type="button" class="wlink" id="wFillCard">4242 4242 4242 4242</button> — أي تاريخ مستقبلي — أي CVV</div>`;
    }
    body.innerHTML = `${summaryBox()}${form}
      <div class="wnote err" id="wErr" style="display:none"></div>
      <button type="button" class="wprimary" id="wSend">إرسال كود التحقق</button>
      <p class="wfine">هيوصلك كود من 6 أرقام لتأكيد العملية.</p>`;

    const err = $('#wErr', body);
    const showErr = t => { err.textContent = t; err.style.display = t ? 'block' : 'none'; };

    if (m.kind === 'card') {
      const num = $('#cNum', body), nm = $('#cName', body), ex = $('#cExp', body), cv = $('#cCvv', body);
      const paint = () => {
        const d = digits(num.value);
        $('#ccNum', body).textContent = (d + '••••••••••••••••').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
        $('#ccName', body).textContent = nm.value.trim().toUpperCase() || 'اسم حامل البطاقة';
        $('#ccExp', body).textContent = ex.value || 'MM/YY';
        $('#ccBrand', body).textContent = d[0] === '4' ? 'VISA' : (/^(5[1-5]|2[2-7])/.test(d) ? 'MASTERCARD' : 'CARD');
        W.card = { num: num.value, exp: ex.value, cvv: cv.value, name: nm.value };
      };
      num.value = W.card.num; nm.value = W.card.name; ex.value = W.card.exp; cv.value = W.card.cvv; paint();
      num.addEventListener('input', () => { num.value = digits(num.value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); paint(); });
      ex.addEventListener('input', () => { let d = digits(ex.value).slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); ex.value = d; paint(); });
      cv.addEventListener('input', () => { cv.value = digits(cv.value).slice(0, 4); paint(); });
      nm.addEventListener('input', paint);
      $('#wFillCard', body).addEventListener('click', () => { num.value = '4242 4242 4242 4242'; paint(); });
    } else {
      const num = $('#wNum', body);
      num.addEventListener('input', () => {
        if (m.kind === 'wallet') num.value = digits(num.value).slice(0, 11);
        W.number = num.value;
      });
    }

    $('#wSend', body).addEventListener('click', () => {
      const v = validateDetails();
      if (!v.ok) { showErr(v.message); return; }
      showErr('');
      W.payRef = v.ref;
      sendOtp(true);
      W.step = 'otp'; renderWallet();
    });
  }

  function validateDetails() {
    const m = METHODS[W.method];
    if (m.kind === 'wallet') {
      const num = digits(W.number);
      if (!/^01[0125]\d{8}$/.test(num)) return { ok: false, message: 'رقم الموبايل غير صحيح — لازم 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015' };
      if (m.prefix && !num.startsWith(m.prefix)) return { ok: false, message: 'رقم ' + m.name + ' لازم يبدأ بـ ' + m.prefix };
      W.number = num;
      try { localStorage.setItem('walletLastMethod', W.method); if (!localStorage.getItem('userPhone')) localStorage.setItem('userPhone', num); } catch (_) {}
      return { ok: true, ref: '•••• ' + num.slice(-4), to: num.slice(0, 3) + '•••••' + num.slice(-3) };
    }
    if (m.kind === 'instapay') {
      const v = String(W.number || '').trim();
      const phone = digits(v);
      if (/^01[0125]\d{8}$/.test(phone) && !/[a-z@]/i.test(v)) {
        try { localStorage.setItem('walletLastMethod', W.method); } catch (_) {}
        return { ok: true, ref: '•••• ' + phone.slice(-4), to: phone.slice(0, 3) + '•••••' + phone.slice(-3) };
      }
      if (/^[A-Za-z0-9._-]{3,30}@instapay$/i.test(v)) {
        try { localStorage.setItem('walletLastMethod', W.method); } catch (_) {}
        return { ok: true, ref: v.replace(/^(.{2}).*(@.*)$/, '$1•••$2'), to: 'الموبايل المربوط بالعنوان' };
      }
      return { ok: false, message: 'اكتب عنوان إنستاباي صحيح (مثال: name@instapay) أو رقم موبايل مصري' };
    }
    const card = digits(W.card.num);
    if (card.length < 13 || card.length > 19 || !luhn(card)) return { ok: false, message: 'رقم البطاقة غير صحيح (تجريبي: 4242 4242 4242 4242)' };
    if (String(W.card.name || '').trim().length < 3) return { ok: false, message: 'اكتب الاسم زي ما هو مكتوب على البطاقة' };
    const mm = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(W.card.exp || '').trim());
    if (!mm) return { ok: false, message: 'تاريخ الانتهاء غير صحيح (MM/YY)' };
    const now = new Date(), y = 2000 + parseInt(mm[2], 10), mo = parseInt(mm[1], 10);
    if (y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth() + 1)) return { ok: false, message: 'البطاقة منتهية' };
    if (!/^\d{3,4}$/.test(String(W.card.cvv || '').trim())) return { ok: false, message: 'الـ CVV غير صحيح' };
    try { localStorage.setItem('walletLastMethod', W.method); } catch (_) {}
    return { ok: true, ref: '•••• ' + card.slice(-4), to: 'تطبيق البنك (3D Secure)' };
  }

  /* --- الخطوة 3: كود التحقق --- */
  function sendOtp() {
    W.otp = String(Math.floor(100000 + Math.random() * 900000));
    W.otpSent = Date.now();
    W.otpExp = Date.now() + 120000;
  }
  function renderOtp(body) {
    const m = METHODS[W.method];
    setHeader('كود التحقق', true);
    const where = m.kind === 'card' ? 'تطبيق البنك' : (m.kind === 'instapay' ? 'إنستاباي' : 'رقم ' + (digits(W.number).slice(0, 3) + '•••••' + digits(W.number).slice(-3)));
    body.innerHTML = `
      <div class="wotp-ico">🔐</div>
      <p class="wotp-text">بعتنالك كود تحقق من 6 أرقام على <b dir="ltr">${esc(where)}</b><br>اكتبه عشان نكمّل شحن <b>${fmt(W.amount)} جنيه</b></p>
      <div class="wdemo" id="wDemo">🧪 وضع تجريبي — مفيش رسالة حقيقية. الكود: <button type="button" class="wlink" id="wFillOtp"><b dir="ltr">${W.otp}</b></button></div>
      <div class="wotp" dir="ltr" id="wOtpRow">
        ${[0, 1, 2, 3, 4, 5].map(i => `<input class="wotp-box" inputmode="numeric" maxlength="1" ${i === 0 ? 'autocomplete="one-time-code"' : ''} aria-label="الرقم ${i + 1}">`).join('')}
      </div>
      <div class="wnote err" id="wErr" style="display:none"></div>
      <button type="button" class="wprimary" id="wConfirm" disabled>تأكيد وشحن</button>
      <div class="wresend"><span id="wTimer"></span> <button type="button" class="wlink" id="wResend" disabled>إعادة إرسال الكود</button></div>`;

    const boxes = Array.from(body.querySelectorAll('.wotp-box'));
    const confirm = $('#wConfirm', body), err = $('#wErr', body);
    const val = () => boxes.map(b => b.value).join('');
    const refresh = () => { confirm.disabled = val().length !== 6; };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = digits(b.value).slice(-1);
        if (b.value && i < 5) boxes[i + 1].focus();
        err.style.display = 'none'; refresh();
        if (val().length === 6) confirm.focus();
      });
      b.addEventListener('keydown', ev => {
        if (ev.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; refresh(); }
        if (ev.key === 'Enter' && !confirm.disabled) confirm.click();
      });
      b.addEventListener('paste', ev => {
        const t = digits((ev.clipboardData || window.clipboardData).getData('text')).slice(0, 6);
        if (!t) return;
        ev.preventDefault();
        t.split('').forEach((ch, k) => { if (boxes[k]) boxes[k].value = ch; });
        (boxes[Math.min(t.length, 5)]).focus(); refresh();
      });
      b.addEventListener('focus', () => b.select());
    });
    $('#wFillOtp', body).addEventListener('click', () => { W.otp.split('').forEach((ch, k) => { boxes[k].value = ch; }); refresh(); confirm.focus(); });
    boxes[0].focus();

    const timerEl = $('#wTimer', body), resend = $('#wResend', body);
    clearInterval(W.timer);
    const tick = () => {
      const left = Math.max(0, Math.ceil((W.otpExp - Date.now()) / 1000));
      const wait = Math.max(0, Math.ceil((W.otpSent + 30000 - Date.now()) / 1000));
      timerEl.textContent = left > 0 ? 'الكود ينتهي بعد ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'الكود انتهى';
      resend.disabled = wait > 0;
      resend.textContent = wait > 0 ? 'إعادة الإرسال بعد ' + wait + ' ث' : 'إعادة إرسال الكود';
    };
    tick(); W.timer = setInterval(tick, 500);
    resend.addEventListener('click', () => {
      sendOtp(); W.attempts = 0;
      $('#wFillOtp', body).innerHTML = '<b dir="ltr">' + W.otp + '</b>';
      boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); refresh(); tick();
      toast('اتبعت كود جديد', 'success');
    });

    confirm.addEventListener('click', async () => {
      if (W.busy) return;
      if (Date.now() > W.otpExp) { err.textContent = 'الكود انتهى — اطلب كود جديد'; err.style.display = 'block'; return; }
      if (val() !== W.otp) {
        W.attempts++;
        const row = $('#wOtpRow', body); row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
        if (W.attempts >= 3) {
          clearInterval(W.timer);
          toast('غلطت 3 مرات — العملية اتلغت، ابدأ من جديد', 'error');
          W.step = 'details'; renderWallet(); return;
        }
        err.textContent = 'الكود غلط — باقي ' + (3 - W.attempts) + ' محاولات';
        err.style.display = 'block';
        boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); refresh();
        return;
      }
      clearInterval(W.timer);
      runTopup();
    });
  }

  function renderBusy(body) {
    setHeader('جاري التنفيذ', false);
    body.innerHTML = `<div class="wbusy"><div class="wspin"></div><p>جاري تنفيذ العملية…<br><small>متقفلش الصفحة</small></p></div>`;
  }

  async function runTopup() {
    W.busy = true; W.step = 'busy'; renderWallet();
    const m = METHODS[W.method], amount = W.amount, op = opId();
    const wRef = walletRef(), txRef = fdb.collection('wallet_tx').doc();
    try {
      await sleep(1100);
      const newBal = await fdb.runTransaction(async t => {
        const snap = await t.get(wRef);
        const cur = snap.exists ? (Number(snap.data().balance) || 0) : 0;
        if (cur + amount > MAX_BALANCE) throw new Error('MAX');
        const nb = round2(cur + amount);
        t.set(wRef, { balance: nb, owner: uid(), updatedAt: SERVER_TS() }, { merge: true });
        t.set(txRef, { userId: uid(), type: 'topup', amount, method: W.method, methodName: m.name, ref: W.payRef || '', opId: op, balanceAfter: nb, timestamp: SERVER_TS() });
        return nb;
      });
      W.done = { amount, op, newBal, method: m.name };
      W.busy = false; W.step = 'done'; renderWallet();
    } catch (e) {
      W.busy = false; W.step = 'details'; renderWallet();
      if (e && e.message === 'MAX') toast('الرصيد الكلي مينفعش يعدّي ' + fmt(MAX_BALANCE) + ' جنيه', 'error');
      else if (e && e.code === 'permission-denied') toast('مفيش صلاحية على المحفظة — راجع قواعد Firestore (wallets / wallet_tx)', 'error');
      else { console.error(e); toast('حصل خطأ ومتم سحب حاجة. جرب تاني.', 'error'); }
    }
  }

  function renderDone(body) {
    const d = W.done;
    setHeader('تم الشحن', false);
    const cont = typeof W.onDone === 'function';
    body.innerHTML = `
      <div class="wdone">
        <div class="wcheck"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></div>
        <h3>تم شحن ${fmt(d.amount)} جنيه ✨</h3>
        <p class="wdone-bal">رصيدك الآن <b id="wCount">0</b> جنيه</p>
        <div class="wsum">
          <div><span>طريقة الدفع</span><b>${esc(d.method)}</b></div>
          <div><span>رقم العملية</span><b class="otag">${esc(d.op)}</b></div>
        </div>
        <button type="button" class="wprimary" id="wOk">${cont ? 'كمّل الشراء' : 'تمام'}</button>
        ${cont ? '<button type="button" class="wghost" id="wLater">رجوع</button>' : ''}
      </div>`;
    const el = $('#wCount', body), from = Math.max(0, d.newBal - d.amount), t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(round2(from + (d.newBal - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    const fin = () => { const cb = W.onDone; W.onDone = null; closeWallet(); if (cb) setTimeout(cb, 150); };
    $('#wOk', body).addEventListener('click', fin);
    const later = $('#wLater', body); if (later) later.addEventListener('click', () => { W.onDone = null; closeWallet(); });
  }

  async function renderHistory(body) {
    setHeader('سجل العمليات', true);
    body.innerHTML = '<div class="wbusy"><div class="wspin"></div></div>';
    try {
      const snap = await fdb.collection('wallet_tx').where('userId', '==', uid()).get();
      if (W.step !== 'history') return;
      const rows = snap.docs.map(d => d.data()).sort((a, b) => tsMs(b) - tsMs(a)).slice(0, 40);
      if (!rows.length) { body.innerHTML = '<p class="wempty">لسه مفيش عمليات على محفظتك.</p>'; return; }
      body.innerHTML = '<div class="whist">' + rows.map(r => {
        const plus = r.type === 'topup';
        const date = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate().toLocaleString('ar-EG') : '—';
        const title = plus ? 'شحن عبر ' + esc(r.methodName || '') : 'شراء: ' + esc(r.packName || 'باك');
        const tag = r.opId || r.orderId || '';
        return `<div class="whist-row">
          <div class="whist-ico ${plus ? 'in' : 'out'}">${plus ? '＋' : '−'}</div>
          <div class="whist-mid"><b>${title}</b><small>${esc(date)}${tag ? ' · ' + esc(tag) : ''}</small></div>
          <div class="whist-amt ${plus ? 'in' : 'out'}" dir="ltr">${plus ? '+' : '−'}${fmt(Math.abs(r.amount))}</div>
        </div>`;
      }).join('') + '</div>';
    } catch (e) {
      console.error(e);
      body.innerHTML = '<p class="wempty" style="color:#ef4444">مقدرتش أحمّل السجل.</p>';
    }
  }

  /* =====================================================================
     2) الشراء من الرصيد
     ===================================================================== */
  const B = { game: null, packId: null, pack: null, step: 'loading', busy: false, done: null };
  let bm = null;

  function bEls() {
    bm = makeModal('buyModal', 'bTitle');
    return { m: bm, title: $('#bTitle', bm), body: $('.wbody', bm), back: $('[data-w="back"]', bm), close: $('[data-w="close"]', bm) };
  }
  function closeBuy() {
    if (B.busy) return;
    if (bm) bm.classList.remove('open');
    B.step = 'closed'; unlockScroll();
  }

  async function buy(game, packId, packData) {
    if (!isLogged()) { toast('سجل دخولك الأول عشان تشتري', 'error'); setTimeout(() => { location.href = 'index.html'; }, 1200); return; }
    if (isTrustedUser()) { toast('التراستيد مش بيشتري', 'error'); return; }
    bindBalance();
    const e = bEls();
    if (!e.m._bound) {
      e.m._bound = true;
      e.close.addEventListener('click', closeBuy);
      e.m.addEventListener('click', ev => { if (ev.target === e.m) closeBuy(); });
      balListeners.add(() => { if (B.step === 'confirm' || B.step === 'nofunds') renderBuy(); });
    }
    B.game = game; B.packId = packId; B.pack = packData || null; B.busy = false; B.done = null; B.step = 'loading';
    e.m.classList.add('open'); lockScroll();
    renderBuy();
    try {
      if (!B.pack) {
        const s = await fdb.collection(game + '_packs').doc(packId).get();
        if (!s.exists) { B.step = 'sold'; renderBuy(); return; }
        B.pack = s.data();
      }
      if (S.balance === null) {
        const w = await walletRef().get();
        S.balance = w.exists ? round2(Number(w.data().balance) || 0) : 0;
        paintPill(false);
      }
      B.step = 'confirm'; renderBuy();
    } catch (err) {
      console.error(err);
      closeBuy();
      toast(err && err.code === 'permission-denied' ? 'مفيش صلاحية على المحفظة — راجع قواعد Firestore' : 'مقدرتش أحمّل بيانات الباك، جرب تاني', 'error');
    }
  }

  function packRow(p) {
    const img = esc(p.mainImage || GAME_IMG(B.game));
    return `<div class="bpack"><img src="${img}" alt=""><div><b>${esc(p.packName || 'حساب')}</b><small>${esc(p.packType || '')}</small></div></div>`;
  }

  function renderBuy() {
    const e = bEls(), body = e.body, p = B.pack;
    e.back.style.visibility = 'hidden';
    e.close.style.visibility = B.busy ? 'hidden' : 'visible';
    if (B.step === 'loading') {
      e.title.textContent = 'تأكيد الشراء';
      body.innerHTML = '<div class="wbusy"><div class="wspin"></div></div>'; return;
    }
    if (B.step === 'sold') {
      e.title.textContent = 'الباك مش متاح';
      body.innerHTML = `<div class="wdone"><div class="wbig">😕</div><h3>الباك ده اتباع لحد تاني</h3>
        <p class="wfine" style="margin-bottom:16px">تقدر تشوف باكات تانية متاحة.</p>
        <button type="button" class="wprimary" id="bClose">تمام</button></div>`;
      $('#bClose', body).addEventListener('click', closeBuy); return;
    }
    if (B.step === 'busy') {
      e.title.textContent = 'جاري الشراء';
      body.innerHTML = '<div class="wbusy"><div class="wspin"></div><p>جاري تأكيد الشراء…</p></div>'; return;
    }
    if (B.step === 'done') {
      const d = B.done;
      e.title.textContent = 'تم الشراء';
      body.innerHTML = `<div class="wdone">
        <div class="wcheck"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></div>
        <h3>مبروك! الحساب بقى بتاعك 🎉</h3>
        <div class="wsum">
          <div><span>رقم الطلب</span><b class="otag">${esc(d.orderId)}</b></div>
          <div><span>اتخصم</span><b>${fmt(d.price)} جنيه</b></div>
          <div class="total"><span>رصيدك الآن</span><b>${fmt(d.newBal)} جنيه</b></div>
        </div>
        <p class="wfine" style="margin:10px 0 14px">بيانات الحساب (الإيميل والباسورد) اتحفظت في «معاملاتي».</p>
        <button type="button" class="wprimary" id="bGo">عرض معاملاتي</button>
        <button type="button" class="wghost" id="bClose">إغلاق</button></div>`;
      $('#bGo', body).addEventListener('click', () => { location.href = 'transactions.html'; });
      $('#bClose', body).addEventListener('click', () => { closeBuy(); });
      return;
    }

    const price = parsePrice(p && p.price);
    const bal = S.balance || 0;
    if (!(price > 0)) {
      e.title.textContent = 'تأكيد الشراء';
      body.innerHTML = `${packRow(p)}<div class="wdone"><div class="wbig">⚠️</div><h3>سعر الباك مش واضح</h3>
        <p class="wfine" style="margin-bottom:16px">«${esc(p.price || '—')}» — كلم الوسيط عشان يظبط السعر.</p>
        <button type="button" class="wprimary" id="bClose">تمام</button></div>`;
      $('#bClose', body).addEventListener('click', closeBuy); return;
    }

    if (bal < price) {
      B.step = 'nofunds';
      const need = Math.ceil(round2(price - bal));
      e.title.textContent = 'رصيدك مش كفاية';
      body.innerHTML = `${packRow(p)}
        <div class="nofunds">
          <div class="nf-ico">👛</div>
          <h3>معندكش رصيد كفاية</h3>
          <p>سعر الباك <b>${fmt(price)}</b> جنيه ورصيدك <b>${fmt(bal)}</b> جنيه<br>ناقصك <b class="nf-need">${fmt(need)} جنيه</b> عشان تكمّل الشراء.</p>
        </div>
        <button type="button" class="wprimary" id="bTop">اشحن المحفظة (${fmt(need)} جنيه)</button>
        <button type="button" class="wghost" id="bClose">إلغاء</button>`;
      $('#bTop', body).addEventListener('click', () => openWallet({ amount: Math.max(need, MIN_TOPUP), onDone: () => {} }));
      $('#bClose', body).addEventListener('click', closeBuy);
      return;
    }

    B.step = 'confirm';
    e.title.textContent = 'تأكيد الشراء';
    body.innerHTML = `${packRow(p)}
      <div class="wsum">
        <div><span>سعر الباك</span><b>${fmt(price)} جنيه</b></div>
        <div><span>رصيدك الحالي</span><b>${fmt(bal)} جنيه</b></div>
        <div class="total"><span>الرصيد بعد الشراء</span><b>${fmt(round2(bal - price))} جنيه</b></div>
      </div>
      <button type="button" class="wprimary" id="bPay">تأكيد الشراء — ${fmt(price)} جنيه</button>
      <button type="button" class="wghost" id="bClose">إلغاء</button>
      <p class="wfine">هيتخصم المبلغ من رصيد محفظتك التجريبي.</p>`;
    $('#bPay', body).addEventListener('click', doBuy);
    $('#bClose', body).addEventListener('click', closeBuy);
  }

  async function doBuy() {
    if (B.busy || B.step !== 'confirm') return;
    B.busy = true; B.step = 'busy'; renderBuy();
    const game = B.game, packId = B.packId, order = orderId();
    const packRef = fdb.collection(game + '_packs').doc(packId);
    const wRef = walletRef();
    const txRef = fdb.collection('user_transactions').doc();
    const wtxRef = fdb.collection('wallet_tx').doc();
    const buyer = uid();
    try {
      await sleep(700);
      const res = await fdb.runTransaction(async t => {
        const wSnap = await t.get(wRef);
        const pSnap = await t.get(packRef);
        if (!pSnap.exists) throw new Error('SOLD');
        const p = pSnap.data();
        const price = parsePrice(p.price);
        if (!(price > 0)) throw new Error('BADPRICE');
        const cur = wSnap.exists ? (Number(wSnap.data().balance) || 0) : 0;
        if (cur < price) { const er = new Error('NOFUNDS'); throw er; }
        const nb = round2(cur - price);
        t.set(wRef, { balance: nb, owner: buyer, updatedAt: SERVER_TS() }, { merge: true });
        t.set(txRef, {
          buyerId: buyer, game, packName: p.packName || '', packType: p.packType || '',
          email: p.email || '', password: p.password || '', platform: p.platform || '',
          packImage: p.mainImage || '', packId, price: p.price || '',
          paymentMethod: 'wallet', paymentRef: 'المحفظة', orderId: order,
          status: 'completed', paidAt: SERVER_TS()
        });
        t.set(wtxRef, { userId: buyer, type: 'purchase', amount: -price, packName: p.packName || '', game, orderId: order, balanceAfter: nb, timestamp: SERVER_TS() });
        t.delete(packRef);
        return { price, newBal: nb };
      });
      B.busy = false; B.step = 'done'; B.done = { orderId: order, price: res.price, newBal: res.newBal };
      renderBuy();
      toast('تم الشراء بنجاح! ✅', 'success');
    } catch (e) {
      B.busy = false;
      const msg = e && e.message;
      if (msg === 'SOLD') { B.step = 'sold'; renderBuy(); }
      else if (msg === 'NOFUNDS') { B.step = 'confirm'; renderBuy(); toast('معندكش رصيد كفاية لإتمام الشراء', 'error'); }
      else if (msg === 'BADPRICE') { B.step = 'confirm'; renderBuy(); toast('سعر الباك مش واضح', 'error'); }
      else if (e && e.code === 'permission-denied') { B.step = 'confirm'; renderBuy(); toast('مفيش صلاحية — راجع قواعد Firestore', 'error'); }
      else { console.error(e); B.step = 'confirm'; renderBuy(); toast('حصل خطأ ومتم سحب حاجة. جرب تاني.', 'error'); }
    }
  }

  /* ---------- تشغيل ---------- */
  function boot() {
    mountButton();
    bindBalance();
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (wm && wm.classList.contains('open')) closeWallet();
      else if (bm && bm.classList.contains('open')) closeBuy();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.Wallet = {
    open: openWallet,
    buy,
    balance: () => S.balance,
    refresh: () => { mountButton(); bindBalance(); paintPill(false); },
    onBalance: fn => { balListeners.add(fn); return () => balListeners.delete(fn); },
    onLivePacks: ids => {
      if (bm && bm.classList.contains('open') && (B.step === 'confirm' || B.step === 'nofunds') && B.packId && ids.indexOf(B.packId) === -1) {
        B.step = 'sold'; renderBuy();
      }
    },
    parsePrice
  };
})();
