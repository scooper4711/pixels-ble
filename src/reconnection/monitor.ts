import { Pixel } from '../Pixel.js';
import { attemptReconnection } from './strategy.js';

type StatusListener = (data: { connected: boolean }) => void;

const RECONNECT_DEBOUNCE_MS = 5_000;

const listeners = new WeakMap<Pixel, StatusListener>();

export function startMonitoring(pixel: Pixel): void {
  if (listeners.has(pixel)) return;

  const listener: StatusListener = ({ connected }) => {
    if (!connected && pixel.device.gatt) {
      setTimeout(() => {
        attemptReconnection(pixel.device, pixel);
      }, RECONNECT_DEBOUNCE_MS);
    }
  };

  listeners.set(pixel, listener);
  pixel.addEventListener('status', listener);
  pixel.startConnectionMonitoring();
}

export function stopMonitoring(pixel: Pixel): void {
  const listener = listeners.get(pixel);
  if (listener) {
    pixel.removeEventListener('status', listener);
    listeners.delete(pixel);
  }
  pixel.stopConnectionMonitoring();
}
