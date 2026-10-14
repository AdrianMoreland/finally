import { Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import { provisionDefaults } from '@finally/db';
import type { Me, UpdateMeBody } from '@finally/contracts';
import { m2 } from '@finally/finance-core';
import { money } from '../common/mappers';
import { InjectDb } from '../common/tokens';

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Injectable()
export class MeService {
  constructor(@InjectDb() private readonly db: Db) {}

  async get(userId: string): Promise<Me> {
    const u = await this.db.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      currency: 'EUR',
      timezone: u.timezone,
      paydayDayOfMonth: u.paydayDayOfMonth,
      monthlySavingsTarget: money(u.monthlySavingsTarget),
      quietHoursStart: u.quietHoursStart,
      quietHoursEnd: u.quietHoursEnd,
      targetAllocation: (u.targetAllocation ?? {}) as Record<string, number>,
    };
  }

  async update(userId: string, body: UpdateMeBody): Promise<Me> {
    await this.db.user.update({
      where: { id: userId },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.paydayDayOfMonth !== undefined ? { paydayDayOfMonth: body.paydayDayOfMonth } : {}),
        ...(body.monthlySavingsTarget !== undefined ? { monthlySavingsTarget: m2(body.monthlySavingsTarget) } : {}),
        ...(body.quietHoursStart !== undefined ? { quietHoursStart: body.quietHoursStart } : {}),
        ...(body.quietHoursEnd !== undefined ? { quietHoursEnd: body.quietHoursEnd } : {}),
        ...(body.targetAllocation !== undefined ? { targetAllocation: body.targetAllocation } : {}),
      },
    });
    return this.get(userId);
  }

  /** Everything the app holds about the user, as plain JSON (no bank session secrets). */
  async exportJson(userId: string) {
    const where = { userId };
    const [user, accounts, transactions, merchants, categories, rules, budgets, goals, instruments, lots, insights, taxRules] =
      await Promise.all([
        this.db.user.findUnique({ where: { id: userId } }),
        this.db.account.findMany({ where }),
        this.db.transaction.findMany({ where, orderBy: { bookingDate: 'asc' } }),
        this.db.merchant.findMany({ where }),
        this.db.category.findMany({ where }),
        this.db.merchantRule.findMany({ where }),
        this.db.budget.findMany({ where }),
        this.db.goal.findMany({ where }),
        this.db.instrument.findMany({ where }),
        this.db.lot.findMany({ where }),
        this.db.insight.findMany({ where }),
        this.db.taxRule.findMany({ where }),
      ]);
    return { exportedAt: new Date().toISOString(), user, accounts, transactions, merchants, categories, rules, budgets, goals, instruments, lots, insights, taxRules };
  }

  async exportCsv(userId: string): Promise<string> {
    const rows = await this.db.transaction.findMany({
      where: { userId },
      include: { account: true, merchant: true, category: true },
      orderBy: { bookingDate: 'asc' },
    });
    const header = ['date', 'account', 'merchant', 'raw_descriptor', 'category', 'kind', 'status', 'amount', 'currency', 'amount_eur', 'note'];
    const lines = rows.map((t) =>
      [
        t.bookingDate.toISOString().slice(0, 10), t.account.name, t.merchant?.displayName, t.rawDescriptor, t.category?.name,
        t.kind, t.status, t.amount.toString(), t.currency, t.amountEur.toString(), t.note,
      ].map(csvCell).join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  /** Remove every row the user owns except the profile itself, then restore the default categories and rules. */
  async deleteAllData(userId: string): Promise<void> {
    const where = { userId };
    await this.db.$transaction([
      this.db.signal.deleteMany({ where }),
      this.db.insight.deleteMany({ where }),
      this.db.categorisationRequest.deleteMany({ where }),
      this.db.priceBar.deleteMany({ where }),
      this.db.lot.deleteMany({ where }),
      this.db.instrument.deleteMany({ where }),
      this.db.budget.deleteMany({ where }),
      this.db.goal.deleteMany({ where }),
      this.db.recurringSeries.deleteMany({ where }),
      this.db.transaction.deleteMany({ where }),
      this.db.merchantRule.deleteMany({ where }),
      this.db.merchant.deleteMany({ where }),
      this.db.account.deleteMany({ where }),
      this.db.syncRun.deleteMany({ where }),
      this.db.bankConnection.deleteMany({ where }),
      this.db.pushDevice.deleteMany({ where }),
      this.db.taxRule.deleteMany({ where }),
      this.db.category.deleteMany({ where }),
      this.db.user.update({ where: { id: userId }, data: { targetAllocation: {} } }),
    ]);
    await provisionDefaults(this.db, userId);
  }
}
