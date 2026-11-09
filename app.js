import { db } from './db.js';
import * as U from './utils.js';

const app = document.getElementById('app');
const state = { txns: [], lastBackup: null, lastMethod: 'UPI', startingBalance: 0 };
const ui = { activity: { q: '', type: 'all', focus: null }, spending: { month: null } };
let hasNavigated = false;
let cleanup = null;

// ---------- Icons ----------
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  pie: svg('<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  del: svg('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9-5 5M11 9l5 5"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  chevR: svg('<path d="m9 6 6 6-6 6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')
};

// ---------- Data ----------
async function load() {
  const txns = await db.allTransactions();
  txns.sort((a, b) =>
    b.date.localeCompare(a.date) ||
    (b.time || '').localeCompare(a.time || '') ||
    (b.createdAt || 0) - (a.createdAt || 0));
  state.txns = txns;
  state.lastBackup = (await db.get('lastBackup')) || null;
  state.lastMethod = (await db.get('lastMethod')) || 'UPI';
  state.startingBalance = (await db.get('startingBalance')) || 0;
}

function monthExpenses() {
  const mk = U.monthKey(U.todayISO());
  return state.txns.filter((t) => t.type === 'expense' && t.date.startsWith(mk));
}

// Balance = starting balance + all income − all expenses.
function balance() {
  return state.txns.reduce((n, t) => n + (t.type === 'income' ? t.amount : -t.amount), state.startingBalance);
}

function runningBalances() {
  const after = new Map();
  let running = state.startingBalance;
  for (let i = state.txns.length - 1; i >= 0; i--) {
    const t = state.txns[i];
    running += t.type === 'income' ? t.amount : -t.amount;
    after.set(t.id, running);
  }
  return after;
}

const signedTotal = (paise) => (paise < 0 ? '−' : '') + U.money(paise);

function monthIncome() {
  const mk = U.monthKey(U.todayISO());
  return state.txns.filter((t) => t.type === 'income' && t.date.startsWith(mk));
}

// ---------- Shared pieces ----------
function tabBar(active) {
  const tabs = [
    ['home', 'Home', ICON.home],
    ['activity', 'Activity', ICON.list],
    ['spending', 'Spending', ICON.pie],
    ['settings', 'Settings', ICON.sliders]
  ];
  return `<nav class="tabbar" aria-label="Main"><div class="inner">${tabs
    .map(([id, label, icon]) =>
      `<a class="tab ${id === active ? 'on' : ''}" href="#/${id}" ${id === active ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`)
    .join('')}</div></nav>`;
}

const fab = () => `<a class="fab" href="#/add" aria-label="Add entry">${ICON.plus}</a>`;

function txRow(t, showDay, after) {
  const c = U.category(t.category);
  const title = t.note || c.name;
  const meta = `${c.name} · ${showDay ? U.dayLabel(t.date) : t.method || ''}`;
  return `<a class="tx" href="#/edit/${encodeURIComponent(t.id)}">
    <div class="avatar" style="background:${c.color}">${U.esc(title.charAt(0).toUpperCase())}</div>
    <div class="info"><div class="title">${U.esc(title)}</div><div class="meta">${U.esc(meta)}</div></div>
    <div class="right">
      <div class="amount num ${t.type === 'income' ? 'in' : ''}">${U.signedMoney(t)}</div>
      ${after !== undefined ? `<div class="after num ${after < 0 ? 'is-over' : ''}">${signedTotal(after)}</div>` : ''}
    </div>
  </a>`;
}

function backupAge() {
  const days = U.daysSince(state.lastBackup);
  if (!state.lastBackup) return 'No backup yet';
  if (days === 0) return 'Last backup today';
  if (days === 1) return 'Last backup yesterday';
  return `Last backup ${days} days ago`;
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function goBack() {
  if (hasNavigated) history.back();
  else location.replace('#/home');
}

// ---------- Home ----------
function renderHome() {
  const today = U.todayISO();
  const bal = balance();
  const moneyIn = U.sum(monthIncome());
  const moneyOut = U.sum(monthExpenses());
  const hasBase = state.startingBalance > 0 || state.txns.some((t) => t.type === 'income');

  const needsBackup = state.txns.length > 0 && U.daysSince(state.lastBackup) > 7;
  const banner = needsBackup
    ? `<div class="banner"><div><b>Back up your data</b><span>${backupAge()}</span></div><button data-action="backup">Back up</button></div>`
    : '';

  const recent = state.txns.slice(0, 5);
  const recentBlock = recent.length
    ? `<section class="section">
        <div class="section-head"><h2>Recent</h2><a class="link" href="#/activity">See all</a></div>
        <div class="list">${recent.map((t) => txRow(t, true)).join('')}</div>
      </section>`
    : `<div class="empty">
        <div class="illus">${ICON.receipt}</div>
        <h3>Nothing added yet</h3>
        <p>Set your starting balance, then add money as it goes out or comes in.</p>
        <a class="btn btn-primary btn-pill" href="#/add">${ICON.plus} Add entry</a>
      </div>`;

  app.innerHTML = `<main class="screen">
    <header class="header"><div><div class="sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Overview</h1></div></header>
    ${banner}
    <section class="summary" aria-label="Balance">
      <span class="label">Balance</span>
      <div class="total num ${bal < 0 ? 'neg' : ''}">${signedTotal(bal)}</div>
      ${hasBase ? '' : '<a class="badge start" href="#" data-action="starting-balance">Set starting balance</a>'}
    </section>
    <section class="flows" aria-label="${U.monthName(today)}">
      <div class="flow-card"><span class="label">In this month</span><span class="value num in">${moneyIn ? '+' : ''}${U.money(moneyIn)}</span></div>
      <a class="flow-card" href="#/spending"><span class="label">Out this month</span><span class="value num">${moneyOut ? '−' : ''}${U.money(moneyOut)}</span><span class="more">See where it went ›</span></a>
    </section>
    ${recentBlock}
  </main>${fab()}${tabBar('home')}`;
}

// ---------- Activity ----------
function renderActivity() {
  const types = [['all', 'All'], ['expense', 'Money out'], ['income', 'Money in']];
  app.innerHTML = `<main class="screen">
    <header class="header"><h1>Activity</h1></header>
    ${ui.activity.focus ? `<div class="focus">Showing <b>${U.category(ui.activity.focus.category).name}</b> in ${U.monthName(ui.activity.focus.month + '-01')}<button data-action="clear-focus">Show all</button></div>` : ''}
    <label class="search">${ICON.search}<input type="search" id="q" placeholder="Search transactions" aria-label="Search transactions" value="${U.esc(ui.activity.q)}"></label>
    <div class="chips scroll" role="group" aria-label="Filter">${types
      .map(([v, l]) => `<button class="chip ${ui.activity.type === v ? 'on' : ''}" data-type="${v}" aria-pressed="${ui.activity.type === v}">${l}</button>`)
      .join('')}</div>
    <div id="groups" class="section" style="gap:18px"></div>
  </main>${fab()}${tabBar('activity')}`;

  const groupsEl = app.querySelector('#groups');
  const draw = () => {
    const q = ui.activity.q.trim().toLowerCase();
    const focus = ui.activity.focus;
    const list = state.txns.filter((t) => {
      if (focus && (t.category !== focus.category || !t.date.startsWith(focus.month))) return false;
      if (ui.activity.type !== 'all' && t.type !== ui.activity.type) return false;
      if (!q) return true;
      const c = U.category(t.category);
      return [t.note, c.name, t.method, String(t.amount / 100)].some((v) => (v || '').toLowerCase().includes(q));
    });

    if (!state.txns.length) {
      groupsEl.innerHTML = `<div class="empty"><div class="illus">${ICON.list}</div><h3>No transactions yet</h3><p>Everything you add shows up here by day, with your balance after each entry.</p></div>`;
      return;
    }
    if (!list.length) {
      groupsEl.innerHTML = `<div class="empty"><h3>Nothing matches</h3><p>Try a different word or switch the filter back to All.</p></div>`;
      return;
    }

    const groups = new Map();
    for (const t of list) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }
    const after = runningBalances();
    groupsEl.innerHTML = [...groups.entries()]
      .map(([date, items]) => {
        const net = items.reduce((n, t) => n + (t.type === 'income' ? t.amount : -t.amount), 0);
        return `<div class="day-group">
          <div class="day-head"><span>${U.dayLabel(date)}</span><span class="num">${net >= 0 ? '+' : '−'}${U.money(net)}</span></div>
          <div class="list">${items.map((t) => txRow(t, false, after.get(t.id))).join('')}</div>
        </div>`;
      })
      .join('');
  };

  app.querySelector('#q').addEventListener('input', (e) => {
    ui.activity.q = e.target.value;
    draw();
  });
  app.querySelectorAll('.chip[data-type]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.activity.type = btn.dataset.type;
      app.querySelectorAll('.chip[data-type]').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', b === btn);
      });
      draw();
    }));
  draw();
}

function openStartingBalanceDialog() {
  const current = state.startingBalance;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<form method="dialog">
    <h2>Starting balance</h2>
    <p>The total you had before your first entry. Your balance is this amount, plus income, minus expenses.</p>
    <input class="input num" name="amount" inputmode="decimal" placeholder="e.g. 50000" aria-label="Starting balance" value="${current ? U.amountToInput(current) : ''}">
    <div class="dialog-actions">
      <button class="btn btn-secondary" value="cancel">Cancel</button>
      <button class="btn btn-primary" value="save">Save</button>
    </div>
  </form>`;
  document.body.appendChild(dialog);
  const input = dialog.querySelector('input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dialog.close('save');
    }
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue === 'save') {
      const cleaned = input.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      await db.set('startingBalance', U.parseAmount(cleaned));
      await load();
      toast('Starting balance saved');
      route();
    }
    dialog.remove();
  });
  dialog.showModal();
}

// ---------- Spending ----------
function donut(rows, total) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const gap = rows.length > 1 ? 3 : 0;
  let offset = 0;
  const segments = rows.map((row) => {
    const full = (row.amount / total) * circ;
    const len = Math.max(0, full - gap);
    const seg = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${row.c.chart}" stroke-width="22" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}"/>`;
    offset += full;
    return seg;
  }).join('');
  return `<svg class="donut" viewBox="0 0 180 180" aria-hidden="true"><g transform="rotate(-90 90 90)">
    <circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--line)" stroke-width="22"/>${segments}</g></svg>`;
}

function renderSpending() {
  const current = U.monthKey(U.todayISO());
  const mk = ui.spending.month || current;
  const expenses = state.txns.filter((t) => t.type === 'expense' && t.date.startsWith(mk));
  const total = U.sum(expenses);

  const byCat = new Map();
  for (const t of expenses) {
    const e = byCat.get(t.category) || { amount: 0, count: 0 };
    e.amount += t.amount;
    e.count += 1;
    byCat.set(t.category, e);
  }
  const rows = [...byCat.entries()]
    .map(([id, v]) => ({ c: U.category(id), ...v }))
    .sort((a, b) => b.amount - a.amount);

  const prev = U.shiftMonth(mk, -1);
  const next = U.shiftMonth(mk, 1);
  const label = U.monthName(mk + '-01');

  const body = total
    ? `<section class="chart-card" aria-label="${label} spending by category">
        <div class="donut-wrap">${donut(rows, total)}
          <div class="donut-center"><span class="num">${U.money(total)}</span><span>spent</span></div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>By category</h2></div>
        <div class="list divided">${rows.map((row) => {
          const pct = Math.round((row.amount / total) * 100);
          return `<button class="cat-row" data-cat="${row.c.id}">
            <span class="dot" style="background:${row.c.chart}"></span>
            <span class="info">
              <span class="name">${row.c.name}</span>
              <span class="meta">${row.count} ${row.count === 1 ? 'entry' : 'entries'}</span>
              <span class="bar light"><i style="width:${Math.max(2, pct)}%;background:${row.c.chart}"></i></span>
            </span>
            <span class="right"><span class="amount num">${U.money(row.amount)}</span><span class="meta num">${pct}%</span></span>
          </button>`;
        }).join('')}</div>
      </section>`
    : `<div class="empty"><div class="illus">${ICON.pie}</div><h3>No spending in ${label}</h3><p>Money you add as an expense will show up here by category.</p></div>`;

  app.innerHTML = `<main class="screen">
    <header class="header"><h1>Spending</h1></header>
    <div class="month-nav">
      <button class="icon-btn" data-month="${prev}" aria-label="Previous month">${ICON.back}</button>
      <span>${label}</span>
      <button class="icon-btn" data-month="${next}" aria-label="Next month" ${next > current ? 'disabled' : ''}>${ICON.chevR}</button>
    </div>
    ${body}
  </main>${tabBar('spending')}`;

  app.querySelectorAll('[data-month]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.spending.month = b.dataset.month;
      renderSpending();
    }));
  app.querySelectorAll('.cat-row').forEach((b) =>
    b.addEventListener('click', () => {
      ui.activity = { q: '', type: 'expense', focus: { category: b.dataset.cat, month: mk } };
      location.hash = '#/activity';
    }));
}

// ---------- Settings ----------
function renderSettings() {
  const fresh = state.lastBackup && U.daysSince(state.lastBackup) <= 7;
  const when = state.lastBackup
    ? new Date(state.lastBackup).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : 'Back up now so you don’t lose anything';

  app.innerHTML = `<main class="screen">
    <header class="header"><h1>Settings</h1></header>
    <div class="status">
      <div class="dot ${fresh ? 'ok' : 'warn'}">${fresh ? ICON.check : ICON.alert}</div>
      <div><div style="font-weight:500">${backupAge()}</div><div class="sub" style="font-weight:400;font-size:12px">${when} · ${state.txns.length} entries on this phone</div></div>
    </div>
    <section class="section" style="gap:10px">
      <div class="group-title">Balance</div>
      <div class="list"><button class="setting" data-action="starting-balance"><span><span class="t">Starting balance</span><span class="s">What you had before your first entry</span></span><span class="num value">${U.money(state.startingBalance)}</span></button></div>
    </section>
    <section class="section" style="gap:10px">
      <div class="group-title">Backup & export</div>
      <div class="list divided">
        <button class="setting" data-action="backup"><span><span class="t">Back up everything</span><span class="s">JSON file, for restoring later</span></span>${ICON.download}</button>
        <button class="setting" data-action="csv"><span><span class="t">Export transactions</span><span class="s">CSV file, opens in Excel or Google Sheets</span></span>${ICON.download}</button>
        <button class="setting" data-action="restore"><span><span class="t">Restore from backup</span><span class="s">Replaces the data on this phone</span></span>${ICON.upload}</button>
      </div>
      <input type="file" id="restore-file" accept="application/json,.json" hidden>
    </section>
    <section class="section" style="gap:10px">
      <div class="group-title">Data</div>
      <div class="list"><button class="setting danger" data-action="delete-all"><span><span class="t">Delete all data</span><span class="s">Removes every entry and your starting balance</span></span>${ICON.trash}</button></div>
    </section>
    <p class="footnote">Your data stays on this phone. Deleting the app or clearing Safari website data removes anything you haven’t backed up.</p>
  </main>${tabBar('settings')}`;

  app.querySelector('#restore-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) restoreFrom(file);
  });
}

// ---------- Backup, export, restore ----------
async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function exportBackup() {
  const settings = (await db.allSettings()).filter((s) => s.key !== 'lastBackup');
  const data = { app: 'finance-app', version: 1, exportedAt: new Date().toISOString(), transactions: state.txns, settings };
  const saved = await shareOrDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `finance-backup-${U.todayISO()}.json`
  );
  if (!saved) return;
  await db.set('lastBackup', new Date().toISOString());
  await load();
  toast('Backup saved');
  route();
}

async function exportCSV() {
  const rows = [['Date', 'Time', 'Type', 'Category', 'Paid with', 'Amount', 'Note']];
  for (const t of [...state.txns].reverse()) {
    rows.push([t.date, t.time || '', t.type, U.category(t.category).name, t.method || '', (t.amount / 100).toFixed(2), t.note || '']);
  }
  const csv = rows
    .map((r) => r.map((v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const saved = await shareOrDownload(new Blob(['\ufeff' + csv], { type: 'text/csv' }), `finance-transactions-${U.todayISO()}.csv`);
  if (saved) toast('Transactions exported');
}

async function restoreFrom(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file isn’t a valid backup');
    return;
  }
  if (!data || data.app !== 'finance-app' || !Array.isArray(data.transactions)) {
    toast('That file isn’t a backup from this app');
    return;
  }
  const transactions = data.transactions.filter((t) =>
    t && typeof t.id === 'string' && Number.isInteger(t.amount) && t.amount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date) && (t.type === 'expense' || t.type === 'income'));
  if (!confirm(`Replace the data on this phone with ${transactions.length} transactions from this backup? This can’t be undone.`)) return;
  const settings = Array.isArray(data.settings)
    ? data.settings.filter((s) => s && typeof s.key === 'string' && s.key !== 'lastBackup')
    : [];
  settings.push({ key: 'lastBackup', value: new Date().toISOString() });
  await db.replaceAll({ transactions, settings });
  await load();
  toast('Backup restored');
  route();
}

async function deleteAll() {
  if (!confirm('Delete all entries and your starting balance from this phone? Back up first if you might need them.')) return;
  await db.replaceAll({ transactions: [], settings: [] });
  await load();
  toast('All data deleted');
  route();
}

// ---------- Add / edit ----------
function renderEditor(id) {
  const existing = id ? state.txns.find((t) => t.id === decodeURIComponent(id)) : null;
  if (id && !existing) {
    location.replace('#/activity');
    return;
  }

  const f = existing
    ? { type: existing.type, amountStr: U.amountToInput(existing.amount), category: existing.category, method: existing.method || 'UPI', note: existing.note || '', date: existing.date, time: existing.time || U.nowTime() }
    : { type: 'expense', amountStr: '', category: 'food', method: state.lastMethod, note: '', date: U.todayISO(), time: U.nowTime() };
  const cats = () => (f.type === 'income' ? U.INCOME_CATEGORIES : U.EXPENSE_CATEGORIES);

  app.innerHTML = `<main class="editor">
    <div class="nav"><button class="icon-btn" data-action="close" aria-label="Close">${ICON.x}</button><h2 id="ed-title"></h2><span></span></div>
    <div class="segmented" role="group" aria-label="Type">
      <button data-type="expense">Expense</button><button data-type="income">Income</button>
    </div>
    <div>
      <div class="amount-display num" id="amount" aria-live="polite"></div>
      <div class="meta-row">
        <input type="date" id="date" value="${f.date}" max="${U.todayISO()}" aria-label="Date">
        <select id="method" aria-label="Paid with">${U.METHODS.map((m) => `<option ${m === f.method ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div><div class="field-label">Category</div><div class="chips" id="cats"></div></div>
    <label class="note">${ICON.pen}<input id="note" type="text" placeholder="Add a note" maxlength="60" enterkeyhint="done" value="${U.esc(f.note)}"></label>
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
      .map((k) => `<button class="key" data-key="${k}" aria-label="${k === 'del' ? 'Delete digit' : k}">${k === 'del' ? ICON.del : k}</button>`)
      .join('')}</div>
    <div class="editor-actions">
      <div class="error" id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" id="save"></button>
      ${existing ? '<button class="delete-link" id="delete">Delete transaction</button>' : ''}
    </div>
  </main>`;

  const $ = (s) => app.querySelector(s);

  const paintAmount = () => {
    const el = $('#amount');
    el.textContent = U.typedAmount(f.amountStr);
    el.classList.toggle('placeholder', !f.amountStr);
  };
  const paint = () => {
    const kind = f.type === 'income' ? 'income' : 'expense';
    $('#ed-title').textContent = existing ? `Edit ${kind}` : `Add ${kind}`;
    $('#save').textContent = existing ? 'Save changes' : `Save ${kind}`;
    app.querySelectorAll('.segmented button').forEach((b) => b.classList.toggle('on', b.dataset.type === f.type));
    $('#cats').innerHTML = cats()
      .map((c) => `<button class="chip ${c.id === f.category ? 'on' : ''}" data-cat="${c.id}" aria-pressed="${c.id === f.category}">${c.name}</button>`)
      .join('');
    paintAmount();
  };

  const press = (k) => {
    let s = f.amountStr;
    if (k === 'del') s = s.slice(0, -1);
    else if (k === '.') {
      if (!s.includes('.')) s = (s || '0') + '.';
    } else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return;
      if (s.replace('.', '').length >= 9) return;
      s = s === '0' ? k : s + k;
    }
    f.amountStr = s;
    $('#err').textContent = '';
    paintAmount();
  };

  const save = async () => {
    const amount = U.parseAmount(f.amountStr);
    if (!amount) {
      $('#err').textContent = 'Enter an amount';
      return;
    }
    const now = Date.now();
    const record = {
      id: existing ? existing.id : U.uid(),
      type: f.type,
      amount,
      category: f.category,
      method: f.method,
      note: f.note.trim(),
      date: f.date || U.todayISO(),
      time: f.time,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await db.putTransaction(record);
    await db.set('lastMethod', f.method);
    await load();
    toast(existing ? 'Changes saved' : f.type === 'income' ? 'Income added' : 'Expense added');
    goBack();
  };

  app.querySelectorAll('.segmented button').forEach((b) =>
    b.addEventListener('click', () => {
      f.type = b.dataset.type;
      if (!cats().some((c) => c.id === f.category)) f.category = cats()[0].id;
      paint();
    }));
  $('#cats').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    f.category = chip.dataset.cat;
    paint();
  });
  app.querySelectorAll('.key').forEach((k) => k.addEventListener('click', () => press(k.dataset.key)));
  $('#date').addEventListener('change', (e) => { f.date = e.target.value || U.todayISO(); });
  $('#method').addEventListener('change', (e) => { f.method = e.target.value; });
  $('#note').addEventListener('input', (e) => { f.note = e.target.value; });
  $('#note').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#save').addEventListener('click', save);
  if (existing) {
    $('#delete').addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      await db.deleteTransaction(existing.id);
      await load();
      toast('Transaction deleted');
      goBack();
    });
  }

  // Typing on a laptop keyboard works too.
  const onKey = (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === '.') press('.');
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') save();
    else if (e.key === 'Escape') goBack();
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);

  paint();
}

// ---------- Router ----------
const routes = {
  home: renderHome,
  activity: renderActivity,
  spending: renderSpending,
  settings: renderSettings,
  add: () => renderEditor(null),
  edit: (id) => renderEditor(id)
};

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (name !== 'activity' && name !== 'edit') ui.activity.focus = null;
  (routes[name] || renderHome)(arg);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const action = el.dataset.action;
  if (action === 'backup') exportBackup();
  else if (action === 'csv') exportCSV();
  else if (action === 'restore') app.querySelector('#restore-file')?.click();
  else if (action === 'delete-all') deleteAll();
  else if (action === 'close') goBack();
  else if (action === 'starting-balance') openStartingBalanceDialog();
  else if (action === 'clear-focus') {
    ui.activity.focus = null;
    ui.activity.type = 'all';
    renderActivity();
  }
});

window.addEventListener('hashchange', () => {
  hasNavigated = true;
  route();
  window.scrollTo(0, 0);
});

async function init() {
  try {
    await load();
  } catch (err) {
    app.innerHTML = `<main class="screen no-tabs"><div class="empty"><h3>Can’t open your data</h3><p>This browser blocked storage. Private browsing mode can cause this. Open the app in a normal Safari tab.</p></div></main>`;
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/home');
  route();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
