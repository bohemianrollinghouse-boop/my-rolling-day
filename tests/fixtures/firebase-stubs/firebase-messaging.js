export async function isSupported() { return false; }
export function getMessaging(app) { return {}; }
export async function getToken(messaging, opts) { return ""; }
export async function deleteToken(messaging) { return false; }
export function onMessage(messaging, handler) { return () => {}; }
