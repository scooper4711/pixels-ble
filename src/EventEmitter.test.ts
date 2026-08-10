import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from './EventEmitter.js';

interface TestEvents {
  foo: { value: number };
  bar: string;
}

class TestEmitter extends EventEmitter<TestEvents> {
  public doEmit<K extends keyof TestEvents>(event: K, data: TestEvents[K]): void {
    this.emit(event, data);
  }
}

describe('EventEmitter', () => {
  it('addEventListener registers a listener that gets called on emit', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();

    emitter.addEventListener('foo', listener);
    emitter.doEmit('foo', { value: 42 });

    expect(listener).toHaveBeenCalledWith({ value: 42 });
  });

  it('multiple listeners on the same event all get called', () => {
    const emitter = new TestEmitter();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    emitter.addEventListener('foo', listenerA);
    emitter.addEventListener('foo', listenerB);
    emitter.doEmit('foo', { value: 7 });

    expect(listenerA).toHaveBeenCalledWith({ value: 7 });
    expect(listenerB).toHaveBeenCalledWith({ value: 7 });
  });

  it('removeEventListener stops future calls', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();

    emitter.addEventListener('foo', listener);
    emitter.doEmit('foo', { value: 1 });
    emitter.removeEventListener('foo', listener);
    emitter.doEmit('foo', { value: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it('listeners on different events do not interfere', () => {
    const emitter = new TestEmitter();
    const fooListener = vi.fn();
    const barListener = vi.fn();

    emitter.addEventListener('foo', fooListener);
    emitter.addEventListener('bar', barListener);

    emitter.doEmit('foo', { value: 99 });

    expect(fooListener).toHaveBeenCalledWith({ value: 99 });
    expect(barListener).not.toHaveBeenCalled();
  });

  it('removing a listener that was never added does not throw', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();

    expect(() => emitter.removeEventListener('foo', listener)).not.toThrow();
  });

  it('emitting an event with no listeners does not throw', () => {
    const emitter = new TestEmitter();

    expect(() => emitter.doEmit('bar', 'hello')).not.toThrow();
  });
});
