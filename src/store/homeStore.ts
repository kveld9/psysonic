import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HomeSectionId = 'hero' | 'recent' | 'discover' | 'discoverArtists' | 'recentlyPlayed' | 'starred' | 'mostPlayed';

export interface HomeSectionConfig {
  id: HomeSectionId;
  visible: boolean;
}

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  { id: 'hero',            visible: true },
  { id: 'recent',          visible: true },
  { id: 'discover',        visible: true },
  { id: 'discoverArtists', visible: true },
  { id: 'recentlyPlayed',  visible: true },
  { id: 'starred',         visible: true },
  { id: 'mostPlayed',      visible: true },
];

interface HomeStore {
  sections: HomeSectionConfig[];
  toggleSection: (id: HomeSectionId) => void;
  reset: () => void;
}

export const useHomeStore = create<HomeStore>()(
  persist(
    (set) => ({
      sections: DEFAULT_HOME_SECTIONS,
      toggleSection: (id) => set((s) => ({
        sections: s.sections.map(sec => sec.id === id ? { ...sec, visible: !sec.visible } : sec),
      })),
      reset: () => set({ sections: DEFAULT_HOME_SECTIONS }),
    }),
    { name: 'psysonic_home' }
  )
);
