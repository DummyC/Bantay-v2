import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Provide a stable localStorage for jsdom and Node runtimes
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  })
}

// Stub media element playback to avoid jsdom not-implemented errors
const mediaProto = (globalThis as any).HTMLMediaElement?.prototype
if (mediaProto) {
  Object.defineProperty(mediaProto, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(mediaProto, 'pause', {
    configurable: true,
    value: vi.fn(),
  })
}