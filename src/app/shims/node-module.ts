// Browser shim — createRequire is never called when __SCORECARD_VERSION__ is defined.
export function createRequire(): never {
  throw new Error('createRequire is not available in the browser');
}
