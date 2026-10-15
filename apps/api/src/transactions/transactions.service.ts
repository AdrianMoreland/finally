import { Injectable, NotFoundException } from '@nestjs/common';
import type { Db, Prisma } from '@finally/db';
import type {
  ListTransactionsQuery,
  ParsedQueryDto,
  RecategoriseTransactionBody,
  TransactionDto,
  TransactionPage,
  UpdatedCountResponse,
  UpdateTransactionBody,
} from '@finally/contracts';
import { AskService } from '../ask/ask.service';
import { CategorisationService } from '../categorisation/categorisation.service';
import { iso, money } from '../common/mappers';
import { InjectDb } from '../common/tokens';

type TxRow = Prisma.TransactionGetPayload<{
  include: {
    account: { include: { connection: { select: { institution: true } } } };
    merchant: true;
    category: true;
  };
}>;

const include = {
  account: { include: { connection: { select: { institution: true } } } },
  merchant: true,
  category: true,
} as const;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly categorisation: CategorisationService,
    private readonly ask: AskService,
  ) {}

  toDto(t: TxRow): TransactionDto {
    return {
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      institution: t.account.connection.institution,
      bookingDate: iso(t.bookingDate),
      amount: money(t.amount),
      currency: t.currency,
      amountEur: money(t.amountEur),
      rawDescriptor: t.rawDescriptor,
      merchant: t.merchant ? { id: t.merchant.id, merchantKey: t.merchant.merchantKey, displayName: t.merchant.displayName } : null,
      category: t.category
        ? { id: t.category.id, name: t.category.name, slug: t.category.slug, colour: t.category.colour, icon: t.category.icon, parentId: t.category.parentId }
        : null,
      status: t.status,
      kind: t.kind,
      categorisedBy: t.categorisedBy,
      needsReview: t.needsReview,
      note: t.note,
      excluded: t.excluded,
      tags: t.tags,
      flag: t.flag,
    };
  }

  async list(userId: string, q: ListTransactionsQuery): Promise<TransactionPage> {
    const and: Prisma.TransactionWhereInput[] = [{ userId }];
    if (q.accountId) and.push({ accountId: q.accountId });
    if (q.categoryId) {
      // include child categories when filtering by a parent
      const kids = await this.db.category.findMany({ where: { userId, parentId: q.categoryId }, select: { id: true } });
      and.push({ categoryId: { in: [q.categoryId, ...kids.map((k) => k.id)] } });
    }
    if (q.kind) and.push({ kind: q.kind });
    if (q.needsReview) and.push({ needsReview: q.needsReview === 'true' });
    if (q.minAmount !== undefined) and.push({ amountEur: { gte: q.minAmount } });
    if (q.maxAmount !== undefined) and.push({ amountEur: { lte: q.maxAmount } });
    if (q.from) and.push({ bookingDate: { gte: new Date(`${q.from}T00:00:00Z`) } });
    if (q.to) and.push({ bookingDate: { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) } });
    if (q.status) and.push({ status: q.status });
    if (q.excluded) and.push({ excluded: q.excluded === 'true' });
    // The search box understands questions such as "coffee over 4 last month"; anything else is a plain text search.
    const readAs: ParsedQueryDto | null = q.q ? await this.ask.parseForSearch(userId, q.q) : null;
    if (readAs) {
      if (readAs.slug) {
        const cat = await this.db.category.findFirst({ where: { userId, slug: readAs.slug }, select: { id: true } });
        const kids = cat ? await this.db.category.findMany({ where: { userId, parentId: cat.id }, select: { id: true } }) : [];
        and.push({ categoryId: { in: cat ? [cat.id, ...kids.map((k) => k.id)] : [] } });
      }
      if (readAs.merchantKey) and.push({ merchant: { merchantKey: readAs.merchantKey } });
      if (readAs.institution) and.push({ account: { connection: { institution: readAs.institution } } });
      if (readAs.min != null) and.push({ amountEur: { lt: -readAs.min } });
      if (readAs.max != null) and.push({ amountEur: { gt: -readAs.max, lt: 0 } });
      if (readAs.period && readAs.periodExplicit) {
        and.push({ bookingDate: { gte: new Date(`${readAs.period.from}T00:00:00Z`) } });
        and.push({ bookingDate: { lt: new Date(new Date(`${readAs.period.to}T00:00:00Z`).getTime() + 86_400_000) } });
      }
    } else if (q.q) {
      and.push({
        OR: [
          { rawDescriptor: { contains: q.q, mode: 'insensitive' } },
          { merchant: { displayName: { contains: q.q, mode: 'insensitive' } } },
          { note: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.TransactionWhereInput = { AND: and };

    let cursorWhere: Prisma.TransactionWhereInput | undefined;
    if (q.cursor) {
      const [date, id] = Buffer.from(q.cursor, 'base64url').toString('utf8').split('|');
      if (date && id) {
        const d = new Date(date);
        cursorWhere = { OR: [{ bookingDate: { lt: d } }, { bookingDate: d, id: { lt: id } }] };
      }
    }
    const [rows, total] = await Promise.all([
      this.db.transaction.findMany({
        where: cursorWhere ? { AND: [where, cursorWhere] } : where,
        include,
        orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
      this.db.transaction.count({ where }),
    ]);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.toDto(r)),
      readAs,
      nextCursor: rows.length > q.limit && last ? Buffer.from(`${last.bookingDate.toISOString()}|${last.id}`).toString('base64url') : null,
      total,
    };
  }

  async get(userId: string, id: string): Promise<TransactionDto> {
    const t = await this.db.transaction.findFirst({ where: { id, userId }, include });
    if (!t) throw new NotFoundException('Transaction not found');
    return this.toDto(t);
  }

  async patch(userId: string, id: string, body: UpdateTransactionBody): Promise<TransactionDto> {
    const res = await this.db.transaction.updateMany({
      where: { id, userId },
      data: {
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.excluded !== undefined ? { excluded: body.excluded } : {}),
        ...(body.tags !== undefined ? { tags: [...new Set(body.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))] } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Transaction not found');
    return this.get(userId, id);
  }

  /** Inline category edit: `merchant` scope also remembers the merchant, `once` changes this payment only. */
  async recategorise(userId: string, id: string, body: RecategoriseTransactionBody): Promise<UpdatedCountResponse> {
    const tx = await this.db.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (body.scope === 'merchant' && tx.merchantId) {
      return this.categorisation.applyToMerchant(userId, tx.merchantId, body.categoryId);
    }
    return this.categorisation.applyOnce(userId, id, body.categoryId);
  }
}
