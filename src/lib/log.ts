/**
 * Thin console wrapper. Always prefix with a layer tag: [viz], [data], [state], [app].
 *
 * `log.debug` is stripped in production builds; `info` / `warn` / `error` survive.
 * Never call `console.*` directly in app code.
 */

type Layer = 'app' | 'viz' | 'data' | 'state';

const PROD = import.meta.env.PROD;

function emit(method: 'debug' | 'info' | 'warn' | 'error', layer: Layer, args: unknown[]): void {
  if (method === 'debug' && PROD) return;
  console[method](`[${layer}]`, ...args);
}

export const log = {
  debug: (layer: Layer, ...args: unknown[]): void => emit('debug', layer, args),
  info: (layer: Layer, ...args: unknown[]): void => emit('info', layer, args),
  warn: (layer: Layer, ...args: unknown[]): void => emit('warn', layer, args),
  error: (layer: Layer, ...args: unknown[]): void => emit('error', layer, args),
};
