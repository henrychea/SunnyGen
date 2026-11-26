export const THEME_STORAGE_KEY = 'sunnygen.theme'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export const THEME_BOOT_SCRIPT = `try{var m=localStorage.getItem('sunnygen.theme')||'system';var d=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute('content',d?'#17120f':'#faf6ef')}catch(e){document.documentElement.dataset.theme='light'}`

export function parseThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode
  return systemPrefersDark ? 'dark' : 'light'
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null): ThemeMode {
  if (!storage) return 'system'
  try {
    return parseThemeMode(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

const CHROME_COLOR: Record<ResolvedTheme, string> = { light: '#faf6ef', dark: '#17120f' }

export function applyTheme(mode: ThemeMode, root?: HTMLElement, prefersDark?: boolean): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark ?? systemPrefersDark())
  const target = root ?? (typeof document === 'undefined' ? null : document.documentElement)
  if (target) target.dataset.theme = resolved
  if (typeof document !== 'undefined') {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[resolved])
  }
  return resolved
}

export function writeThemeMode(mode: ThemeMode, storage?: Pick<Storage, 'setItem'>): void {
  const target = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
  if (target) {
    try {
      target.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      // A blocked storage still themes the current tab; only the preference is lost.
    }
  }
  applyTheme(mode)
}

export function startThemeSync(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DARK_QUERY)
  const sync = () => {
    applyTheme(readStoredTheme(window.localStorage), undefined, query.matches)
  }
  sync()
  query.addEventListener('change', sync)
  return () => query.removeEventListener('change', sync)
}
