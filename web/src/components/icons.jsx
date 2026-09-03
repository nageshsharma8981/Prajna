// Praxis icon set — drawn in the world's own grammar: 1.6px strokes, square
// joints, board-and-ticket motifs. One consistent weight throughout.
const I = ({ children, ...p }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" width="17" height="17" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const FloorIcon = (p) => (
  <I {...p}>
    <rect x="2.5" y="3.5" width="15" height="9" rx="1" />
    <path d="M5.5 6.5h6M5.5 9.5h9" />
    <path d="M6 16.5h8M10 12.5v4" />
  </I>
);
export const LedgerIcon = (p) => (
  <I {...p}>
    <path d="M4 2.5h9.5l2.5 2.5v12.5H4z" />
    <path d="M7 7h6M7 10h6M7 13h4" />
  </I>
);
export const SkillIcon = (p) => (
  <I {...p}>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="11" y="11" width="6" height="6" rx="1" />
    <path d="M11 6h3.5v3.5M9 14H5.5v-3.5" />
  </I>
);
export const SeatIcon = (p) => (
  <I {...p}>
    <path d="M10 3v5.5M6.5 5.2a5.5 5.5 0 1 0 7 0" />
    <circle cx="10" cy="13" r="1" fill="currentColor" stroke="none" />
  </I>
);
export const OpenIcon = (p) => (
  <I {...p}>
    <path d="M8 4H4v12h12v-4" />
    <path d="M11 3.5h5.5V9M16.5 3.5 9.5 10.5" />
  </I>
);
export const MoonIcon = (p) => (
  <I {...p}>
    <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />
  </I>
);
export const SunIcon = (p) => (
  <I {...p}>
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" />
  </I>
);
export const MenuIcon = (p) => (
  <I {...p}>
    <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
  </I>
);
export const SearchIcon = (p) => (
  <I {...p}>
    <circle cx="9" cy="9" r="5" />
    <path d="M13 13l4 4" />
  </I>
);
export const BackIcon = (p) => (
  <I {...p}>
    <path d="M12.5 4 6.5 10l6 6" />
  </I>
);
