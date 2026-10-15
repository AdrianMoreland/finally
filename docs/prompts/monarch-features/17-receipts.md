# 17 · Receipts: attach by upload or photo, optionally split into items

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md`, `05-transaction-tooling-a-bulk-columns-log.md`
(detail drawer, activity log). **Decide open question 2 in `00-plan.md` first** (where files live). This prompt assumes the recommended default: a private **Supabase Storage** bucket,
accessed only by the API, with a **local-disk driver** for dev and tests. If the answer was different, implement the same `StorageProvider` interface against that backend.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure logic in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Everything must work with `BANK_PROVIDER=mock` and **no keys** (local storage driver). Privacy: receipts are personal data. No OCR service, no LLM, no third-party calls, no public URLs, no EXIF location kept.
- Web: React 19, Tailwind v4, shadcn. Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. On any transaction I can **attach receipts**: upload an image or PDF on web, or take a **photo** on the phone.
2. Optionally **split the payment into items** (e.g. a €96.40 Tesco shop = groceries €71.20 + household €18.00 + wine €7.20), each with its own category. Budgets, reports and the recap then count each item in its own category.
3. Receipts are listed on the transaction, viewable (image preview / PDF open) through short-lived links, and removable.

## Read first

- `apps/web/src/routes/_app/transactions.tsx` and the detail drawer from prompt 05; `apps/mobile/src/components/payments.tsx`, `apps/mobile/app/_layout.tsx`, `app.json` (permissions).
- `apps/api/src/common/env.ts` (add storage env), `.env.example`, `apps/api/src/main.ts` (body limits, helmet), `apps/api/src/common/redact.ts`.
- `apps/api/src/data/finance-data.service.ts` (`coreTxs`, `spendByCategory`), `packages/finance-core/src/types.ts` (`CoreTx`), `insights.ts` (`isSpend`, `detectRecurring`, `anomalies`), prompt 06's `reports.ts`, prompt 12's budgets, prompt 14's recap — every consumer of category spend.
- `apps/api/src/me/me.service.ts` (`exportJson`, `deleteAllData`), prompt 01's `TransactionEvent` kinds `SPLIT` and `ATTACHMENT`.
- `README.md` Supabase section (Supabase is "auth only" today; this prompt changes that for storage and must update the docs).

## Data model (migration `<next timestamp>_receipts`)

```prisma
enum AttachmentKind { RECEIPT OTHER }
enum AttachmentSource { UPLOAD CAMERA }

model Attachment {
  id String @id @default(cuid())
  userId String
  transactionId String
  kind AttachmentKind @default(RECEIPT)
  source AttachmentSource @default(UPLOAD)
  storageKey String                    // opaque path: u/<userId>/<attachmentId>/<random>; never derived from the file name
  filename String                      // sanitised display name
  mime String                          // image/jpeg | image/png | image/webp | application/pdf
  sizeBytes Int
  sha256 String
  width Int?
  height Int?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  transaction Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  @@unique([transactionId, sha256])    // the same file is not attached twice to one payment
  @@index([userId, createdAt])
}

model TransactionSplit {
  id String @id @default(cuid())
  userId String
  transactionId String
  position Int
  amount Decimal @db.Decimal(14,2)     // same sign as the transaction, in the transaction's currency
  amountEur Decimal @db.Decimal(14,2)
  categoryId String?                   // SetNull; null = "uncategorised part"
  description String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  transaction Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  category Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  @@index([transactionId, position])
}
```
RLS + REVOKE on both. Export: JSON lists attachment **metadata** and splits (not the files; say so in the file). Delete-all: delete storage objects **first** (list keys, delete, then rows), tolerate missing objects.
Add `Transaction.hasSplits Boolean @default(false)` and `attachmentCount Int @default(0)` (denormalised, maintained in the service) so lists don't need joins.

## Storage

`apps/api/src/storage/` with `storage.provider.ts` (`put(key, buffer, mime)`, `getSignedUrl(key, ttlSeconds)`, `delete(key)`, `exists(key)`), `local.provider.ts` (writes under `.data/receipts`, gitignored; `getSignedUrl` returns an API URL `/attachments/:id/file?token=<HMAC, 60 s>` served by the API), and `supabase.provider.ts` (Storage REST via `fetch` with `SUPABASE_SECRET_KEY` server-side only; private bucket `receipts`; signed URL TTL 60 s). Env: `STORAGE_DRIVER=local|supabase` (default `local`), `SUPABASE_SECRET_KEY` and `RECEIPTS_BUCKET` (default `receipts`) added to `envSchema` and `.env.example`, and to `redact.ts`. The `supabase` driver refuses to start in production without the key. **Clients never receive the secret key and never talk to Supabase Storage.**

## API

- `POST /transactions/:id/attachments` (multipart, one file per request, field `file`, optional `source`): limits **10 MB**, **25 files per transaction**, **500 MB per user**; allowed MIME by **content sniffing** (magic bytes), not the extension or client MIME; reject HEIC/HEIF with "Convert to JPEG first" (the phone app converts before upload); for images, re-encode with `sharp` (already allowed in `onlyBuiltDependencies`): auto-rotate from EXIF, **strip all metadata including GPS**, cap the long edge at 2,400 px, quality 82 → store the processed bytes; PDFs are stored as is (no JavaScript execution happens server-side; the web opens them in a new tab/`<iframe sandbox>`-free viewer via the browser PDF viewer). Compute `sha256` of the stored bytes. Write an `ATTACHMENT` event. Rate-limit this route lower than the global throttle.
- `GET /transactions/:id/attachments` (metadata), `GET /attachments/:id/url` → `{url, expiresAt}` (60 s), `DELETE /attachments/:id` (object then row, event), `GET /attachments/:id/file?token=` (local driver only; verifies HMAC, sets `content-type`, `content-disposition: inline`, `cache-control: private, no-store`, `x-content-type-options: nosniff`).
- Splits: `PUT /transactions/:id/splits` body `{items: [{amount, categoryId|null, description?}]}` replaces the set. Validation: ≥ 2 items; **Σ amounts must equal the transaction amount exactly** (decimal compare, same sign, each item non-zero); categories belong to the user, not archived, not TRANSFER; `amountEur` derived proportionally from the transaction's `amountEur` with the rounding remainder assigned to the largest item (`allocate(amountEur, weights)` pure function). `DELETE /transactions/:id/splits` clears. Paired transfers cannot be split (400). Writes a `SPLIT` event with before/after summaries. Splitting resets `needsReview`.
- Contracts: `attachmentSchema`, `splitItem`, `putSplitsBody`, `transactionSchema` gets `attachmentCount`, `hasSplits`, `splits` (only on detail). Hooks: `useAttachments(id)`, `useUploadAttachment` (progress via `XMLHttpRequest`/fetch streams on web), `useSetSplits`.

### Making every category total honour splits

Add `expandSplits(txs, splitsByTx)` to `finance-core` and use it in `FinanceDataService.coreTxs` behind a new option `expandSplits: boolean`:

- `true` (default for **category-based** consumers: budgets `spendByCategory`, reports, overview top categories, recap, alerts, goals linked by category): a split payment becomes N virtual `CoreTx` lines with `id = <txId>#<position>`, each with its own `categoryId` and `amountEur`, same date/merchant/flags; the parent is not also counted.
- `false` for **payment-level** analytics: recurring detection/matching (prompt 10), anomalies, leaks, price-change, double-charge style checks, and the transactions list.
Audit every call site (`grep -rn "coreTxs"`) and pass the option explicitly; add a lint-style unit test that the default is explicit by making the parameter required for new call sites. Reports' transaction drill-down shows the parent payment with a "split into 3" badge.

## Web UI

In the transaction detail drawer (prompt 05):

- **Receipts** section: dropzone + "Choose file" (`accept="image/*,application/pdf"`, multiple), upload progress per file, thumbnails (fetch a signed URL per thumbnail lazily, cache for 45 s), click opens a Dialog lightbox (image) or a new tab (PDF), delete with confirm. Errors per file (too big, wrong type, over quota) inline. Count badge on the Transactions row (paperclip icon with number, `aria-label="2 receipts"`).
- **Split** section: "Split this payment" opens an editor table (amount, category select, description), live "Remaining €x" that must reach 0.00 before Save is enabled, "Add line", "Split evenly", "Remove split". Quick-fill: a button "Use receipt items" is **not** offered (no OCR); items are typed by hand. Shows the parent amount and currency. Disabled for paired transfers with an explanation.
- Row display: a split payment shows its primary category as "3 categories" chip with a tooltip listing them; filtering by category matches any split line (extend `buildTransactionWhere` with `splits: { some: { categoryId } }` OR the payment's own category when no splits).
- States: skeletons for thumbnails, empty ("No receipts yet. Drop a file or take a photo on your phone"), errors with retry.

## Mobile

- Payment detail sheet (prompt 05): **Add receipt** → action sheet *Take photo* / *Choose from library* using `expo-image-picker` (add the dependency, `app.json` permissions with clear usage strings: camera "to photograph receipts", photo library "to attach receipts"); convert to JPEG and downscale on device (`expo-image-manipulator`) before upload; upload with the api-client (multipart); thumbnails via signed URLs; delete. Split editor as a simple full-screen form.
- No background upload queue; if the request fails, show a retry button (offline support is out of scope).

## Edge cases

- **Pending vs posted:** attachments, splits and notes live on the transaction row, and prompt 05's carry-over keeps them when the row posts. If the **posted amount differs** from the pending one, existing splits no longer sum: keep the splits but mark `splitsStale` and show "This payment changed from €90.00 to €96.40. Review the split." and **do not** count the stale split (fall back to the parent) until the user fixes it.
- **Refunds:** a refund can have its own receipt/split; splitting a refund keeps the positive sign; a refund of one item can be recorded as a split on the refund payment with the original categories.
- **Transfers between own accounts:** cannot be split; can have attachments (e.g. proof of transfer).
- **Rent shares:** a rent-share credit can carry a screenshot; splitting it is rejected (400).
- **Multi-currency (Revolut):** split amounts are in the payment's currency; `amountEur` is allocated proportionally; the editor shows both amounts.
- **Payday periods:** splits use the parent's booking date.
- Duplicate upload of the same file: 200 with the existing attachment (unique `(transactionId, sha256)`).
- Corrupt image / zip-bomb dimension limits: refuse images over 50 megapixels before decoding; `sharp` `limitInputPixels`.
- Orphaned storage objects (row creation failed after upload): upload to storage **after** inserting a pending row, or delete the object in the catch; add a nightly job `storage-gc` that lists objects with no row and removes those older than 24 h.
- Deleting the transaction (e.g. a cancelled pending payment) cascades rows; a trigger or service hook removes the objects (GC covers failures).
- `deleteAllData` with a failing storage driver: fail loudly **before** deleting database rows so nothing is orphaned silently.
- Logs and Sentry: never log file names, keys or signed URLs (add to `redact.ts`).
- Accessibility: thumbnails have alt text "Receipt 1 of 2 for Tesco, 12 Oct"; the lightbox is keyboard-closable.

## Acceptance criteria

1. Upload a JPEG with GPS EXIF to a payment: the stored file has no EXIF GPS (verify with a test using `sharp(...).metadata()`), is ≤ 2,400 px, and the thumbnail shows.
2. A `.exe` renamed `.jpg` is rejected by sniffing. An 11 MB file is rejected. The 26th file is rejected. Duplicate upload is idempotent.
3. Signed URLs stop working after 60 s (local driver: expired token ⇒ 403).
4. Split €96.40 into 71.20 / 18.00 / 7.20: Σ must match or Save is disabled; Groceries budget rises by 71.20 (not 96.40), Household by 18.00; the Reports tree shows the three amounts; recurring detection still treats it as one payment.
5. Change the pending amount before posting: splits flagged stale and ignored until reviewed.
6. Export JSON includes metadata only; "Delete all data" removes files and rows.
7. Mobile: take a photo, see it attached on web after refresh.
8. No request leaves the app for receipts except to your API (check network tab); with `STORAGE_DRIVER=supabase` objects are in a **private** bucket (a direct public URL returns 400/403).

## Tests

- finance-core: `allocate(amountEur, weights)` (rounding remainder to the largest item, negative amounts, 3-way 0.01 splits), `expandSplits` (lines, ids, flags preserved, stale fallback), consumers' totals with/without splits (budgets spendByCategory, reports summary).
- API: upload validation matrix (sniffing, size, count, quota, duplicates, EXIF stripped, HEIC rejection), signed-URL expiry/HMAC tamper, storage provider contract tests run against the local driver (and Supabase behind an env flag skipped by default), split validation (sum, sign, categories, transfers), filter-by-category with splits, GC job, `deleteAllData` ordering, ownership scoping (another user's attachment id ⇒ 404).
- e2e: create split → budgets response changes → remove split → restored.

## Out of scope

OCR / automatic item extraction (privacy and cost), email-in receipts, expense reports, warranty tracking, offline upload queue, video, sharing receipts with others, virus scanning.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so. Update README storage notes and `.env.example`.
3. Report what changed, migration name, deferred items, acceptance results.
