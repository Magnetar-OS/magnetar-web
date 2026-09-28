/**
 * The application suite, as shown on the page and drawn in the field.
 *
 * Summaries are the apps' own AppStream `<summary>` lines, benchmarks are the
 * parity floors from the suite's standing brief, and hues are the icon
 * palette in magnetar-brand. The array index is the app's flux tube in the
 * magnetosphere, so reordering this list re-colours the field to match.
 */
export interface App {
  name: string;
  /** Lowercase repo and binary name; also the icon file under /icons. */
  slug: string;
  /** Package name in the [magnetar] pacman repository. */
  package: string;
  category: string;
  summary: string;
  /** The app it is measured against for feature parity, when one is named. */
  benchmark: string | null;
  /** Icon palette, light stop. Used for the app's flux tube. */
  hue: string;
}

export const apps: readonly App[] = [
  { name: 'Slate', slug: 'slate', package: 'slate', category: 'Calendar & tasks', summary: 'View and manage your events and tasks.', benchmark: 'GNOME Calendar', hue: '#5B7CFF' },
  { name: 'Envelope', slug: 'envelope', package: 'envelope', category: 'Mail', summary: 'Read and write your mail.', benchmark: 'Thunderbird’s mail core', hue: '#59C77A' },
  { name: 'Circle', slug: 'circle', package: 'circle', category: 'Contacts', summary: 'Find and edit the people in your address book.', benchmark: 'GNOME Contacts', hue: '#FF7A6B' },
  { name: 'Locket', slug: 'locket', package: 'locket', category: 'Passwords & keyring', summary: 'Keep passwords, keys and secrets for your desktop.', benchmark: 'KeePassXC', hue: '#F2B84B' },
  { name: 'Jump', slug: 'jump', package: 'jump', category: 'Launcher', summary: 'Search applications, windows, files and clipboard.', benchmark: 'Raycast', hue: '#FF8A3D' },
  { name: 'Peek', slug: 'peek', package: 'magnetar-peek', category: 'File preview', summary: 'Preview files without opening them.', benchmark: 'macOS Quick Look', hue: '#3ED2C8' },
  { name: 'Pencil', slug: 'pencil', package: 'pencil', category: 'Documents', summary: 'Write and format documents.', benchmark: null, hue: '#A66BFF' },
  { name: 'Pocket', slug: 'pocket', package: 'pocket', category: 'Passes & tickets', summary: 'Boarding passes, tickets and cards, with their barcodes ready to scan.', benchmark: null, hue: '#FF6FA8' },
];

/** The pieces the apps are built on, plus the one app without an icon yet. */
export const underneath: readonly { name: string; repo: string; role: string }[] = [
  { name: 'cosmic-pim', repo: 'cosmic-pim', role: 'Storage, sync, credentials, iCalendar and vCard. Slate, Circle and Envelope share it, so a bug is fixed once.' },
  { name: 'Nib', repo: 'cosmic-ext-nib', role: 'A rich text engine with no web engine in the pipeline. Envelope’s composer and all of Pencil.' },
  { name: 'cosmic-ext-widgets', repo: 'cosmic-ext-widgets', role: 'Widgets libcosmic does not have, such as a sidebar that collapses to a rail.' },
  { name: 'grabit', repo: 'grabit', role: 'Select text anywhere and get a small bar of actions over it. Wayland only.' },
];

/**
 * The figures in the brief's "Measured in …" line. Reproduce them with
 * `scripts/measure-suite.sh`, which counts each Rust repo's committed `main`
 * with git grep: every line of tracked `*.rs` files, every `#[test]` or
 * `#[tokio::test]` attribute line, and every `todo!(` call.
 */
export const measured = {
  date: 'September 2026',
  rustLines: 201_790,
  tests: 2_717,
  todos: 0,
} as const;

export const GITHUB = 'https://github.com/Magnetar-OS';
