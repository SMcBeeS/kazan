import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType, useOutlet } from 'react-router-dom'

/**
 * Orchestrates a noticeable two-phase fade-out (380ms) -> swap -> fade-in (700ms)
 * whenever the user navigates to a new page or presses Back/Forward.
 */
export function PageTransition({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()

  const [displayedOutlet, setDisplayedOutlet] = useState(outlet)
  const [stage, setStage] = useState<'enter' | 'exit'>('enter')
  const [renderKey, setRenderKey] = useState(location.pathname)

  const latestOutletRef = useRef(outlet)
  latestOutletRef.current = outlet

  const latestNavTypeRef = useRef(navigationType)
  latestNavTypeRef.current = navigationType

  const latestKeyRef = useRef(location.key)
  latestKeyRef.current = location.key

  const prevPathRef = useRef(location.pathname)
  const scrollPositions = useRef<Map<string, number>>(new Map())

  // Track scroll position for Back/Forward restoration.
  useEffect(() => {
    const key = location.key
    const onScroll = () => {
      scrollPositions.current.set(key, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key])

  useEffect(() => {
    // Same pathname (e.g. updating filter query params on /catalog): update in place.
    if (location.pathname === prevPathRef.current) {
      setDisplayedOutlet(latestOutletRef.current)
      return
    }

    prevPathRef.current = location.pathname
    setStage('exit')

    const timer = window.setTimeout(() => {
      setDisplayedOutlet(latestOutletRef.current)
      setRenderKey(location.pathname)
      setStage('enter')

      // Restore scroll position while opacity is 0 between fade-out and fade-in.
      if (latestNavTypeRef.current === 'POP') {
        const y = scrollPositions.current.get(latestKeyRef.current) ?? 0
        window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      }
    }, 360)

    return () => window.clearTimeout(timer)
  }, [location.pathname])

  return (
    <div key={renderKey} className={stage === 'exit' ? 'page-exit' : 'page-enter'}>
      {displayedOutlet ?? children}
    </div>
  )
}