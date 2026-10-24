/**
 * hls.js ships its type declarations via the top-level "types" field, but its
 * package "exports" map has no explicit "types" condition. Some TS resolvers
 * (moduleResolution: bundler) miss it, so we re-declare the module here to keep
 * `import Hls from 'hls.js'` well-typed without loosening the resolver.
 */
declare module 'hls.js/dist/hls.js' {
  const Hls: {
    new (config?: Record<string, unknown>): {
      loadSource(url: string): void
      attachMedia(video: HTMLMediaElement): void
      destroy(): void
      on(event: string, callback: (...args: unknown[]) => void): void
    }
    isSupported(): boolean
    Events: Record<string, string>
  }
  export default Hls
}

