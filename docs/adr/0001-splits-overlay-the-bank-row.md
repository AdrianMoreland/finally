---
status: accepted
---

# Splits overlay the bank row

A split divides one transaction into parts with their own amounts and categories, but the bank's row is never changed: the ledger is built by reading the parts, as it already does for rent (`expandRentSplits`). Parts may include a non-cash part, so a transaction's parts can add up to more than the money that moved.

## Consequences

Every calculation (budgets, safe to spend, cash flow, Ask, review) must read the ledger through the split layer and never raw rows. When the bank changes a transaction's amount, the parts are kept and the difference goes into the largest part, with the transaction flagged for a check.
