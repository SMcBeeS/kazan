/**
 * useAsync — a tiny data-fetching hook with loading / error / reload states.
 *
 * It aborts in-flight requests on unmount and re-runs when `deps` change or
 * `reload()` is called. Keeps components free of boilerplate.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const factoryRef = useRef(factory)
  factoryRef.current = factory

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))

    factoryRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null })
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof Error && err.message === 'aborted') {
          setState({ data: null, loading: false, error: null })
          return
        }
        const message = err instanceof Error ? err.message : 'تعذّر تحميل البيانات.'
        setState({ data: null, loading: false, error: message })
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
