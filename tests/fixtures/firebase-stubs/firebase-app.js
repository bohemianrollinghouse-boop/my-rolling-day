const _apps = new Map();
export function initializeApp(config, name = "[DEFAULT]") {
  if (_apps.has(name)) return _apps.get(name);
  const app = { name, options: config, automaticDataCollectionEnabled: false };
  _apps.set(name, app);
  return app;
}
export function getApp(name = "[DEFAULT]") { return _apps.get(name) || initializeApp({}, name); }
export function getApps() { return [..._apps.values()]; }
export function registerVersion() {}
export function setLogLevel() {}
export const SDK_VERSION = "10.12.5";
