import { fileURLToPath } from 'node:url';
import { defineConfig, tsModuleAdapter } from '@saotesi/figma-bridge';
import { shadcnPreset } from '@saotesi/figma-bridge/preset-shadcn';

const family = (stack) => stack.split(',')[0].replace(/["']/g, '').trim();

// Text styles the builders bind to. Sizes mirror the classes in apps/web (page title 30px display, panel title 11.5px caps ...).
const textStyles = ({ fonts }) => {
    const BODY = fonts.body.family;
    const DISPLAY = fonts.display.family;
    return [
        { name: 'muted', family: BODY, weight: 400, size: 14, lineHeight: { unit: 'PIXELS', value: 20 }, letterSpacing: 0 },
        { name: 'field-label', family: BODY, weight: 500, size: 14, lineHeight: { unit: 'PIXELS', value: 20 }, letterSpacing: 0 },
        { name: 'label', family: BODY, weight: 500, size: 12, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: 0 },
        { name: 'large', family: BODY, weight: 600, size: 18, lineHeight: { unit: 'PIXELS', value: 28 }, letterSpacing: 0 },
        { name: 'section-label', family: BODY, weight: 600, size: 11.5, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: 7 },
        { name: 'h4', family: DISPLAY, weight: 700, size: 18, lineHeight: { unit: 'PIXELS', value: 24 }, letterSpacing: -1 },
        { name: 'h3', family: DISPLAY, weight: 700, size: 24, lineHeight: { unit: 'PIXELS', value: 32 }, letterSpacing: -1 },
        { name: 'h1', family: DISPLAY, weight: 700, size: 30, lineHeight: { unit: 'PERCENT', value: 108 }, letterSpacing: -2 },
        { name: 'big', family: DISPLAY, weight: 700, size: 34, lineHeight: { unit: 'PERCENT', value: 100 }, letterSpacing: -2 },
        { name: 'mono', family: family(fonts.mono.family), weight: 400, size: 11.5, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: 1 },
    ];
};

// The app's three radii, plus the names the shadcn components use (sm/md = control, lg/xl = card).
const radius = ({ radius: r }) => ({ control: r.control, card: r.card, chip: r.chip, sm: r.control, md: r.control, lg: r.card, xl: r.card, full: 9999 });

// The shadcn roles, mapped the way the CSS the app ships maps them (packages/tokens/scripts/generate.ts).
const aliases = {
    background: 'paper',
    foreground: 'ink',
    card: 'surface',
    'card-foreground': 'ink',
    popover: 'surface',
    'popover-foreground': 'ink',
    primary: 'fill',
    'primary-foreground': 'on-fill',
    secondary: 'raised',
    'secondary-foreground': 'ink',
    muted: 'raised',
    'muted-foreground': 'ink-2',
    accent: 'raised',
    'accent-foreground': 'ink',
    destructive: 'bad',
    border: 'rule',
    input: 'rule',
    ring: 'brand',
    'chart-1': 'c-groceries',
    'chart-2': 'c-transport',
    'chart-3': 'c-eating-out',
    'chart-4': 'c-bills',
    'chart-5': 'c-coffee',
};

const CATEGORIES = ['rent', 'groceries', 'eating-out', 'coffee', 'transport', 'bills', 'shopping', 'subscriptions', 'fun', 'other'];

// The shadcn molecules, with this app's roles and sample copy. It leaves out the ones the app has no component for.
const shadcn = shadcnPreset({
    roles: { onPrimary: 'primary-foreground', linkText: 'primary', secondaryFill: 'secondary', switchOff: 'input' },
    style: { buttonShadow: 'xs' },
    colours: { success: 'good' },
    exclude: [
        'molecules/radio-group',
        'molecules/avatar',
        'molecules/accordion',
        'molecules/breadcrumb',
        'molecules/command',
        'molecules/spinner',
        'molecules/calendar',
        'molecules/navigation-menu',
    ],
    copy: {
        email: 'adrian@example.ie',
        person: { name: 'Adrian Moreland', initials: 'AM' },
        pillTabs: [],
        textarea: 'Rent moves to the 1st, so budget from payday.',
        table: {
            columns: ['Merchant', 'Category', 'Date', 'Amount'],
            rows: [
                ['Tesco', 'Groceries', '12 Oct', '-€86.40'],
                ['Luas', 'Transport', '11 Oct', '-€2.50'],
                ['Salary', 'Income', '10 Oct', '+€3,150.00'],
            ],
        },
        select: { placeholder: 'Select a category', options: ['Groceries', 'Eating out', 'Transport', 'Bills'] },
        tooltip: 'Sort every payment from this merchant',
        hoverCard: { handle: '@finally', text: 'Personal finance, in euro.' },
        toast: {
            default: ['Already up to date', 'Last synced just now.'],
            success: ['3 new payments', 'Synced from AIB and Revolut.'],
            error: ['Sync failed', 'Check your connection and try again.'],
        },
        listItem: 'Payment',
    },
});

export default defineConfig({
    name: 'Finally design system',
    manifestId: '1700000000000000042',
    label: 'Finally',
    root: fileURLToPath(new URL('../..', import.meta.url)),
    tokens: tsModuleAdapter({
        entry: 'packages/tokens/dist/index.js',
        name: 'Finally design system',
        generatedFrom: 'packages/tokens/src/index.ts',
        palettes: { light: 'light', dark: 'dark' },
        groups: [{ export: 'categoryColours', prefix: 'c-' }],
        flattenOver: 'surface',
        aliases,
        textStyles,
        radius,
        // What used to be hardcoded in the colour and typography reference frames.
        colourGroups: [
            { title: 'Brand and marker', roles: ['brand', 'brand-ink', 'brand-soft', 'marker', 'marker-ink'] },
            { title: 'Status', roles: ['good', 'warn', 'bad', 'warn-soft', 'bad-soft'] },
            { title: 'Surfaces and text', roles: ['paper', 'surface', 'raised', 'ink', 'ink-2', 'ink-3', 'rule'] },
            { title: 'shadcn roles (components/ui)', roles: ['background', 'foreground', 'card', 'primary', 'primary-foreground', 'secondary', 'muted', 'muted-foreground', 'accent', 'destructive', 'border', 'input', 'ring'] },
            { title: 'Categories', roles: CATEGORIES.map((slug) => `c-${slug}`), plain: true },
        ],
        sampleText: { mono: 'AIB 4521 TESCO STORES DUBLIN IE', default: 'Groceries €86.40 · Left to spend €412' },
        accentRole: 'brand',
        fontFallback: 'Inter',
    }),

    // Names the existing Figma files use. Do not change them.
    framePrefix: 'Finally · ',
    pluginDataNamespace: 'finally',
    textStylePrefix: 'Finally/',
    settingsKey: 'finally-plugin-settings',
    library: { kind: 'finally-library', file: 'finally-library.json', selectionFilePrefix: 'finally-', dir: 'design/exports' },

    componentsDir: 'apps/web/src/components/ui',
    icons: { package: 'lucide-react', from: 'apps/web' },
    logo: {
        size: 32,
        // The mark from Logo() in apps/web/src/components/app-shell.tsx, in the light-theme brand colours.
        svg: ({ model }) => {
            const brand = model.primitives['light/brand'];
            const ink = model.primitives['light/brand-ink'];
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect x="1" y="1" width="30" height="30" rx="9" fill="${brand}"/><path d="M10 10.5h12" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="19.5" r="5.6" stroke="${ink}" stroke-width="2.4"/><path d="M16 17v5" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
        },
    },

    presets: [shadcn],
    // The engine files come from the package; the shadcn molecules and this app's builders after them.
    sourceFiles: ['core.js', 'variables.js', shadcn.sourceFile, './design/figma/components.js', './design/figma/blocks.js', './design/figma/layouts.js', 'export.js', 'spec-check.js', 'compose.js', 'main.js'],
    groupOrder: ['variables', 'molecules', 'components', 'blocks', 'layouts'],
    catalogue: ['./design/figma/catalogue.mjs'],
    // Import tools/figma-plugin/dist/manifest.json in Figma (Plugins, Development, Import plugin from manifest).
    outDir: 'tools/figma-plugin/dist',
});
