// Small inline icons. The markup below is fixed text written here, never built from user input.
const ICONS = {
  logo: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M18 78 L10 32 L30 50 L50 18 L70 50 L90 32 L82 78 Z M16 84 H84 V92 H16 Z" fill="currentColor"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z"/></svg>',
  first: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM19 5.5v13a.8.8 0 0 1-1.25.66L9.5 13.2a.8.8 0 0 1 0-1.32l8.25-5.96A.8.8 0 0 1 19 5.5Z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 5.2v13.6a.8.8 0 0 1-1.25.66l-8.2-6.8a.8.8 0 0 1 0-1.32l8.2-6.8A.8.8 0 0 1 16.5 5.2Z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.2v13.6a.8.8 0 0 0 1.25.66l8.2-6.8a.8.8 0 0 0 0-1.32l-8.2-6.8A.8.8 0 0 0 7.5 5.2Z"/></svg>',
  last: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM5 5.5v13a.8.8 0 0 0 1.25.66l8.25-5.96a.8.8 0 0 0 0-1.32L6.25 4.84A.8.8 0 0 0 5 5.5Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".22"/><path d="m7 12.5 3.4 3.4L17 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".22"/><path d="M12 6.5v7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.5" fill="currentColor"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".22"/><path d="m8 8 8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".22"/><circle cx="12" cy="12" r="4.5" fill="currentColor"/></svg>',
  dice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGElement {
  const doc = new DOMParser().parseFromString(
    ICONS[name].replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '),
    "image/svg+xml",
  );
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}
