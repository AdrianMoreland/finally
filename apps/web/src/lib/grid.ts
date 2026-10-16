/**
 * 12-column dashboard grid spans. Full literal class names so Tailwind can see them.
 * Below `md` every card is full width; `md` gives two columns; `xl` gives the prototype's spans.
 */
export const SPAN = {
  3: 'col-span-12 md:col-span-6 xl:col-span-3',
  4: 'col-span-12 md:col-span-6 xl:col-span-4',
  5: 'col-span-12 md:col-span-6 xl:col-span-5',
  6: 'col-span-12 md:col-span-6',
  7: 'col-span-12 md:col-span-12 xl:col-span-7',
  8: 'col-span-12 md:col-span-12 xl:col-span-8',
  12: 'col-span-12',
} as const;

export const GRID = 'grid grid-cols-12 gap-2.5';
