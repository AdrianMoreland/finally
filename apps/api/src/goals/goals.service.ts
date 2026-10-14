import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { CreateGoalBody, GoalDto } from '@finally/contracts';
import { D, dublinDate, m2, monthOf, addMonths, Decimal } from '@finally/finance-core';
import { dateOnly, money, parseDateOnly } from '../common/mappers';
import { InjectDb } from '../common/tokens';

/** Whole months from `fromMonth` to `toDate`'s month, at least 1 so "per month" is always defined. */
const monthsBetween = (from: string, to: string): number => {
  let n = 0;
  for (let m = monthOf(from); m < monthOf(to); m = addMonths(m, 1)) n++;
  return Math.max(1, n);
};

@Injectable()
export class GoalsService {
  constructor(@InjectDb() private readonly db: Db) {}

  private toDto(g: { id: string; name: string; target: unknown; targetDate: Date; accountId: string | null; saved: unknown }, accountBalance?: string): GoalDto {
    const target = D(String(g.target));
    const saved = accountBalance !== undefined ? D(accountBalance) : D(String(g.saved));
    const monthsLeft = monthsBetween(dublinDate(new Date()), dateOnly(g.targetDate));
    const remaining = Decimal.max(target.minus(saved), 0);
    return {
      id: g.id,
      name: g.name,
      target: m2(target),
      targetDate: dateOnly(g.targetDate),
      accountId: g.accountId,
      saved: m2(saved),
      monthlyNeeded: m2(remaining.div(monthsLeft)),
      monthsLeft,
      progress: target.isZero() ? 0 : Math.min(100, saved.div(target).times(100).toDecimalPlaces(1).toNumber()),
    };
  }

  /** A goal linked to an account (a Revolut vault, say) tracks that account's balance. */
  async list(userId: string): Promise<GoalDto[]> {
    const goals = await this.db.goal.findMany({ where: { userId }, include: { account: true }, orderBy: { targetDate: 'asc' } });
    return goals.map((g) => this.toDto(g, g.account ? money(g.account.balance) : undefined));
  }

  async create(userId: string, body: CreateGoalBody): Promise<GoalDto> {
    if (body.accountId && !(await this.db.account.findFirst({ where: { id: body.accountId, userId } }))) {
      throw new BadRequestException('Unknown account');
    }
    const g = await this.db.goal.create({
      data: { userId, name: body.name, target: m2(body.target), targetDate: parseDateOnly(body.targetDate), accountId: body.accountId, saved: m2(body.saved) },
      include: { account: true },
    });
    return this.toDto(g, g.account ? money(g.account.balance) : undefined);
  }

  async update(userId: string, id: string, body: Partial<CreateGoalBody>): Promise<GoalDto> {
    if (!(await this.db.goal.findFirst({ where: { id, userId } }))) throw new NotFoundException('Goal not found');
    const g = await this.db.goal.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.target !== undefined ? { target: m2(body.target) } : {}),
        ...(body.targetDate !== undefined ? { targetDate: parseDateOnly(body.targetDate) } : {}),
        ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
        ...(body.saved !== undefined ? { saved: m2(body.saved) } : {}),
      },
      include: { account: true },
    });
    return this.toDto(g, g.account ? money(g.account.balance) : undefined);
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.db.goal.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException('Goal not found');
  }
}
