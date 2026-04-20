export function installMockLocalStorage(initialValues = {}) {
  const store = new Map(
    Object.entries(initialValues).map(([key, value]) => [String(key), String(value)]),
  );

  const mock = {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: mock,
  });

  return mock;
}

export function uninstallMockLocalStorage() {
  delete globalThis.localStorage;
}
