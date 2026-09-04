// Prajñā icon set, drawn in the world's own grammar: 1.6px strokes, square
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
export const KeyIcon = (p) => (
  <I {...p}>
    <circle cx="7" cy="10" r="3.5" />
    <path d="M10.5 10h7M15 10v3M17.5 10v2.2" />
  </I>
);
export const DownloadIcon = (p) => (
  <I {...p}>
    <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
    <path d="M4 14.5v2h12v-2" />
  </I>
);
export const PauseIcon = (p) => (
  <I {...p}>
    <path d="M7 4.5v11M13 4.5v11" strokeWidth="2.2" />
  </I>
);
export const PlayIcon = (p) => (
  <I {...p}>
    <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" strokeWidth="1" />
  </I>
);
export const BackIcon = (p) => (
  <I {...p}>
    <path d="M12.5 4 6.5 10l6 6" />
  </I>
);

export const EditIcon = (p) => (<I {...p}><path d="M4 16h4l8-8-4-4-8 8v4z" /><path d="M11 5l4 4" /></I>);
export const PluginIcon = (p) => (<I {...p}><path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" /><path d="M7 8V4M13 8V4M10 17v1.5" /></I>);
export const FactoryIcon = (p) => (<I {...p}><path d="M3 16.5V8l5 3V8l5 3V5h4v11.5z" /></I>);
export const BoardIcon = (p) => (<I {...p}><rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8" y="4" width="4" height="8" rx="1" /><rect x="13" y="4" width="4" height="10" rx="1" /></I>);
export const ToolIcon = (p) => (<I {...p}><path d="M12.5 3.5a4 4 0 0 0-4.6 5.4L3.5 13.3l3.2 3.2 4.4-4.4a4 4 0 0 0 5.4-4.6l-2.4 2.4-2.1-2.1z" /></I>);
export const SiteIcon = (p) => (<I {...p}><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M7 4v4" /></I>);
export const PhoneIcon = (p) => (<I {...p}><rect x="6" y="2.5" width="8" height="15" rx="2" /><path d="M9 15h2" /></I>);
export const DeckIcon = (p) => (<I {...p}><rect x="3" y="4" width="14" height="10" rx="1.5" /><path d="M10 14v3M7 17h6" /></I>);
export const ChartIcon = (p) => (<I {...p}><path d="M4 16V9M10 16V4M16 16v-6" /></I>);
export const ClipIcon = (p) => (<I {...p}><path d="M14.5 9.5 9 15a3 3 0 0 1-4.2-4.2l6.4-6.4a2 2 0 0 1 2.8 2.8L8 13.2a1 1 0 0 1-1.4-1.4L11.5 7" /></I>);
export const MicIcon = (p) => (<I {...p}><rect x="7.5" y="3" width="5" height="9" rx="2.5" /><path d="M5 10a5 5 0 0 0 10 0M10 15v2.5" /></I>);
export const SendIcon = (p) => (<I {...p}><path d="M10 16V4M5 9l5-5 5 5" /></I>);
export const ChevronIcon = (p) => (<I {...p} width="12" height="12"><path d="M5 8l5 5 5-5" /></I>);
export const PanelIcon = (p) => (<I {...p}><circle cx="7" cy="8" r="2.5" /><circle cx="13" cy="8" r="2.5" /><path d="M3 16a4 4 0 0 1 8 0M9 16a4 4 0 0 1 8 0" /></I>);
export const MediaIcon = (p) => (<I {...p}><rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="M8 8l4 2-4 2z" fill="currentColor" stroke="none" /></I>);
export const SparkIcon = (p) => (<I {...p}><path d="M10 3v4M10 13v4M3 10h4M13 10h4M6 6l2 2M12 12l2 2M14 6l-2 2M8 12l-2 2" /></I>);
export const ArrowIcon = (p) => (<I {...p}><path d="M4 10h12M11 5l5 5-5 5" /></I>);
export const FilterIcon = (p) => (<I {...p}><path d="M3 5h14M6 10h8M8.5 15h3" /></I>);
