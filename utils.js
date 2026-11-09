// Categories, money formatting and date helpers.

export const EXPENSE_CATEGORIES = [
  { id: 'food', name: 'Food', color: '#FDE7D6' },
  { id: 'transport', name: 'Transport', color: '#DCE9F7' },
  { id: 'bills', name: 'Bills', color: '#EDE3F7' },
  { id: 'shopping', name: 'Shopping', color: '#FFE1DC' },
  { id: 'health', name: 'Health', color: '#DDF0E2' },
  { id: 'fun', name: 'Fun', color: '#F3EBC9' },
  { id: 'rent', name: 'Rent', color: '#E3EEF0' },
  { id: 'other', name: 'Other', color: '#ECEAE4' }
];

export const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Salary', color: '#DDF0E2' },
  { id: 'freelance', name: 'Freelance', color: '#DCE9F7' },
  { id: 'refund', name: 'Refund', color: '#F3EBC9' },
  { id: 'other-income', name: 'Other income', color: '#ECEAE4' }
];

export const METHODS = ['UPI', 'Cash', 'Card', 'Bank'];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
export function category(id) {
  return ALL.find((c) => c.id === id) || { id, name: 'Other', color: '#ECEAE4' };
}

// Money is stored as whole paise (integers) so totals never drift.
const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(paise) {
  const abs = Math.abs(paise);
  return (abs % 100 === 0 ? whole : exact).format(abs / 100);
}

export function signedMoney(t) {
  return (t.type === 'income' ? '+' : '−') + money(t.amount);
}

export function parseAmount(str) {
  if (!str) return 0;
  const [rupees, decimals = ''] = String(str).split('.');
  return parseInt(rupees || '0', 10) * 100 + parseInt((decimals + '00').slice(0, 2), 10);
}

export function amountToInput(paise) {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  if (!rest) return String(rupees);
  return `${rupees}.${String(rest).padStart(2, '0')}`;
}

// Shows what's being typed on the keypad, with Indian digit grouping.
export function typedAmount(str) {
  if (!str) return '₹0';
  const [rupees, decimals] = str.split('.');
  const grouped = Number(rupees || 0).toLocaleString('en-IN');
  return '₹' + grouped + (decimals !== undefined ? '.' + decimals : '');
}

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthName(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function dayLabel(iso) {
  const today = todayISO();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === today) return 'Today';
  if (iso === toISODate(y)) return 'Yesterday';
  const [yr, m, d] = iso.split('-').map(Number);
  return new Date(yr, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function daysLeftInMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate();
}

export function daysSince(isoDateTime) {
  if (!isoDateTime) return Infinity;
  return Math.floor((Date.now() - new Date(isoDateTime).getTime()) / 86400000);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function sum(list) {
  return list.reduce((total, t) => total + t.amount, 0);
}
