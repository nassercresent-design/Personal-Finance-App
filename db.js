// Small IndexedDB wrapper. All data stays on this device.
const DB_NAME = 'finance-app';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('transactions')) {
          const store = db.createObjectStore('transactions', { keyPath: 'id' });
          store.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  allTransactions: () => run('transactions', 'readonly', (s) => s.getAll()),
  putTransaction: (t) => run('transactions', 'readwrite', (s) => s.put(t)),
  deleteTransaction: (id) => run('transactions', 'readwrite', (s) => s.delete(id)),

  async get(key) {
    const row = await run('kv', 'readonly', (s) => s.get(key));
    return row ? row.value : undefined;
  },
  set: (key, value) => run('kv', 'readwrite', (s) => s.put({ key, value })),
  allSettings: () => run('kv', 'readonly', (s) => s.getAll()),

  // Replaces everything in one go (used by restore and "delete all").
  async replaceAll({ transactions, settings }) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['transactions', 'kv'], 'readwrite');
      const ts = tx.objectStore('transactions');
      const ks = tx.objectStore('kv');
      ts.clear();
      ks.clear();
      transactions.forEach((t) => ts.put(t));
      settings.forEach((s) => ks.put(s));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
};
