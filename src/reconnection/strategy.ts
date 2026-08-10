import { Pixel } from '../Pixel.js';

export type ReconnectionStrategy = 'unknown' | 'watch' | 'poll';

const WATCH_TIMEOUT_MS = 10_000;
const STALE_DISCONNECT_DELAY_MS = 1_000;
const BACKOFF_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

let strategy: ReconnectionStrategy = 'unknown';

const reconnectAttempts = new WeakMap<BluetoothDevice, number>();

export function getStrategy(): ReconnectionStrategy {
  return strategy;
}

export function resetStrategy(): void {
  strategy = 'unknown';
}

export async function attemptReconnection(
  device: BluetoothDevice,
  pixel: Pixel,
): Promise<void> {
  if (strategy === 'watch') {
    try {
      await attemptWatchReconnection(device, pixel);
    } catch {
      await attemptPollReconnection(device, pixel);
    }
    return;
  }

  if (strategy === 'poll') {
    await attemptPollReconnection(device, pixel);
    return;
  }

  // strategy === 'unknown' — probe watch support
  try {
    await attemptWatchReconnection(device, pixel);
    strategy = 'watch';
  } catch {
    strategy = 'poll';
    await attemptPollReconnection(device, pixel);
  }
}

export async function attemptWatchReconnection(
  device: BluetoothDevice,
  pixel: Pixel,
): Promise<void> {
  const controller = new AbortController();
  const { signal } = controller;

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort();
      device.removeEventListener('advertisementreceived', onAdvertisement);
      reject(new Error('Watch reconnection timed out'));
    }, WATCH_TIMEOUT_MS);

    const onAdvertisement = (): void => {
      clearTimeout(timeout);
      controller.abort();
      device.removeEventListener('advertisementreceived', onAdvertisement);
      performGattReconnection(device, pixel).then(resolve).catch(reject);
    };

    device.addEventListener('advertisementreceived', onAdvertisement);

    device.watchAdvertisements({ signal }).catch((error: unknown) => {
      clearTimeout(timeout);
      device.removeEventListener('advertisementreceived', onAdvertisement);
      reject(error);
    });
  });
}

export async function attemptPollReconnection(
  device: BluetoothDevice,
  pixel: Pixel,
): Promise<void> {
  const maxAttempts = BACKOFF_DELAYS_MS.length;
  let attempt = reconnectAttempts.get(device) ?? 0;

  while (attempt < maxAttempts) {
    try {
      await performGattReconnection(device, pixel);
      reconnectAttempts.set(device, 0);
      return;
    } catch {
      const delay = BACKOFF_DELAYS_MS[attempt] ?? BACKOFF_DELAYS_MS[maxAttempts - 1];
      attempt++;
      reconnectAttempts.set(device, attempt);
      await sleep(delay);
    }
  }

  reconnectAttempts.set(device, 0);
  throw new Error(
    `Poll reconnection failed after ${maxAttempts} attempts`,
  );
}

export async function performGattReconnection(
  device: BluetoothDevice,
  pixel: Pixel,
): Promise<void> {
  if (device.gatt?.connected) {
    device.gatt.disconnect();
    await sleep(STALE_DISCONNECT_DELAY_MS);
  }

  await pixel.connect();
  pixel.startConnectionMonitoring();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
