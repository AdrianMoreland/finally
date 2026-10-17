# Finally

The language of a personal finance app for one person in Ireland: money comes in from the bank, gets sorted into categories, and the user is asked only when the app cannot tell.

## Categorisation

**Transaction**:
One line from the bank: money out, money in, a transfer or a refund. Pending and booked are states of the same transaction.
_Avoid_: Payment, entry, bank line

**Merchant**:
The cleaned identity of whoever a transaction is with, found from the bank's raw text. One merchant has one merchant key, and everything about how it is sorted hangs off it. A person who sends or receives money is a Person, never a Merchant.
_Avoid_: Payee, vendor, shop

**Unsorted**:
A transaction that has no category yet. Unsorted transactions count as spent until they are sorted, so overspending is never hidden.
_Avoid_: Uncategorised, needs review

**Ask**:
One open question: which category does a merchant belong in, or whose rent share is this credit? A merchant ask is at most one per merchant, however many unsorted transactions it covers; a credit ask is about a single transaction.
_Avoid_: Request, prompt, question

**To sort**:
The inbox that lists every open ask. Answering an ask from a notification or from here is the same action.
_Avoid_: Queue, review, inbox

**Category**:
What a transaction was for: Groceries, Rent, Coffee. Every category belongs to one category group.
_Avoid_: Tag, label

**Category group**:
The broad bucket a category sits in: Essentials, Lifestyle, Savings, Income or Transfer. It decides which categories can have a budget and whether a transaction is spending, income or a transfer.
_Avoid_: Ask group

**Rule**:
A match on a merchant that sends its transactions to a category. A rule is either yours or built-in; yours always win, then the higher priority, then the more exact match.
_Avoid_: Mapping, filter

**Your rule**:
A rule created by answering an ask with Every time.
_Avoid_: User rule

**Built-in rule**:
A rule that ships with the app for common Irish merchants. Your rules override it; it is never edited.
_Avoid_: Seed rule, default rule

**Sorted by**:
How a transaction got its category: Your rule, You (Just this once), Built-in, or Nobody (it is unsorted). A suggestion from the optional AI helper only picks which quick answers an ask shows; it never sorts anything.
_Avoid_: Categorised by, source

**Quick answers**:
The few category buttons shown on an ask, chosen by what kind of merchant it looks like (food, transport, shopping, bills, fun). Other merchants get no buttons.
_Avoid_: Ask group, suggestions

**Kind**:
The role a transaction's money plays: Spend, Income, Transfer, Refund or Share (a housemate's rent contribution, which is neither income nor a refund). Only Spend and Refund are asked about; Income and Transfer follow their category group.
_Avoid_: Type, direction

**Every time**:
Answering an ask by creating a rule for the merchant, so all its transactions, past and future, go to that category.
_Avoid_: Always, merchant scope

**Just this once**:
Answering an ask for one transaction only, without creating a rule.
_Avoid_: Once, one-off

**Split**:
Dividing one transaction into parts, each with its own amount and category (a Tesco shop into tobacco and groceries; a housemate's transfer into rent share and something else). The bank's row is never changed; every screen reads the parts.
_Avoid_: Itemise, break down

**Non-cash part**:
A part of a split that was settled without money moving, such as a housemate deducting your electricity share from their rent transfer. It counts as your spending in its category and as paid toward their rent share.
_Avoid_: Deduction, offset

**Outside budgets**:
Spending in categories that have no budget. It is shown beside the budgets so that budgeted spending plus outside-budgets spending equals total spending.
_Avoid_: Unbudgeted, other

## Overdraft

**Overdraft limit**:
The most an account may go below zero, as arranged with the bank. It is set per account.
_Avoid_: Credit limit

**Overdraft room**:
What is left of the overdraft limit: the limit minus how far the account is below zero. Room can be spent (safe to spend counts it, less the amount you keep free) but is never an asset, so net worth uses the real balance.
_Avoid_: Available credit

## Rent

**Rent share**:
The amount one housemate owes toward the landlord's rent. It is set per person, per month it takes effect from, so earlier months keep the amounts that applied then.
_Avoid_: Contribution, rent split

**Your share**:
What is left of the landlord's total after every other housemate's rent share. It is the only part of the rent that counts as your spending.
_Avoid_: Own share (in the UI)

**Mark as rent share**:
Telling the app a received transaction is a particular housemate's rent share. Just this once marks one transaction; Every time also teaches the app that housemate's text, so future ones are caught.
