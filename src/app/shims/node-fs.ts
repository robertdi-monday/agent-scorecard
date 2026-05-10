// Browser shim — fs functions are not used in the app path.
export function readFileSync(): never {
  throw new Error('readFileSync is not available in the browser');
}
