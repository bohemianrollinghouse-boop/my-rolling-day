export function getStorage(app) { return {}; }
export function ref(storage, path) { return { _path: path || "" }; }
export async function uploadBytes(ref, data) { return { ref }; }
export async function getDownloadURL(ref) { return ""; }
export async function deleteObject(ref) {}
