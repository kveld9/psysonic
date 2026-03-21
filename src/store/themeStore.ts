import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'mocha' | 'macchiato' | 'frappe' | 'latte' | 'nord' | 'nord-snowstorm' | 'nord-frost' | 'nord-aurora' | 'psychowave' | 'classic-winamp' | 'poison' | 'nucleo' | 'gruvbox-dark-hard' | 'gruvbox-dark-medium' | 'gruvbox-dark-soft' | 'gruvbox-light-hard' | 'gruvbox-light-medium' | 'gruvbox-light-soft' | 'tokyo-night' | 'tokyo-night-storm' | 'tokyo-night-light';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'mocha',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'psysonic_theme',
    }
  )
);
