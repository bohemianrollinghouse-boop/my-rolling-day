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

/**
 * Stub minimal de `document` pour les modules qui posent le theme :
 * un documentElement avec attributs + classList, et un jeu de <meta>
 * interrogeable par querySelector/querySelectorAll.
 */
export function installMockDocument({ metas = [] } = {}) {
  const makeElement = (attributes = {}) => {
    const store = new Map(Object.entries(attributes));
    return {
      getAttribute: (name) => (store.has(name) ? store.get(name) : null),
      setAttribute: (name, value) => store.set(name, String(value)),
      attributes: store,
    };
  };

  const classes = new Set();
  const documentElement = {
    ...makeElement(),
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
    },
  };

  const metaElements = metas.map((name) => ({ name, element: makeElement({ content: "" }) }));
  const match = (selector) => {
    const parsed = selector.match(/^meta\[name="(.+)"\]$/);
    if (!parsed) return [];
    return metaElements.filter((entry) => entry.name === parsed[1]).map((entry) => entry.element);
  };

  const mock = {
    documentElement,
    querySelector: (selector) => match(selector)[0] || null,
    querySelectorAll: (selector) => match(selector),
  };

  Object.defineProperty(globalThis, "document", { configurable: true, value: mock });
  return mock;
}

export function uninstallMockDocument() {
  delete globalThis.document;
}
