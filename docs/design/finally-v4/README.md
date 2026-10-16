# Finally v4 design reference

Captured from `Finally_Prototype_v4.html` (the prototype file itself is not committed: it contains personal names).
Names in these images are neutral samples; layout, spacing, colours and numbers are the prototype's own.

- `web-1440/{dark,light}/*.jpg` the "Web app" view at 1440px wide, full page. `web-400/` the same at 400px.
  `name--state.jpg` files are the same page in a different state (for example `cashflow--selected-food`).
- `phone/{dark,light}/*.jpg` the "Phone" view, screen content only, full scroll height (no device frame).
- `golden.json` numbers computed by the prototype's own model (rent rounds, cash flow for every period, safe to spend,
  actions, ladder). Use them as worked examples in tests.
- `computed-styles.json` resolved CSS values (tokens, and the computed style of cards, KPI tiles, chips, tables, controls,
  Sankey text) in dark and light.
- `capture.mjs` regenerates all of it: `PLAYWRIGHT_PATH=<node_modules dir> node capture.mjs <prototype.html> [outDir]`.
  Re-run it to get lossless output (the committed JPEGs are compressed).
