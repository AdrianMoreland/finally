import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { CreatePotBody, LadderDto, PotDto, PotsDto as PotsShape } from '@finally/contracts';
import {
  addDays,
  D,
  Decimal,
  freedomSim,
  m2,
  moneyLadder,
  nthPayday,
  potReach,
  potStatus,
  potTarget,
  reachText,
  sum,
  type PotCore,
} from '@finally/finance-core';
import { dateOnly, money, parseDateOnly } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { PeopleService } from '../people/people.service';
import { SnapshotService, type PotRow, type Snapshot } from '../snapshot/snapshot.service';

const WISH_WAIT_DAYS = 30;
const WISH_WAIT_OVER = 100;

@Injectable()
export class PotsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly people: PeopleService,
  ) {}

  core(s: Snapshot, p: PotRow): PotCore {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      balance: this.snapshot.potBalance(p),
      target: p.target ? p.target.toString() : null,
      targetDate: p.targetDate ? dateOnly(p.targetDate) : null,
      monthly: p.monthly.toString(),
    };
  }

  /** The money ladder: the next rung and a date for each, at your current plan. */
  ladder(s: Snapshot): LadderDto {
    const safety = s.pots.find((p) => p.type === 'SAFETY');
    const plan = this.people.payoff(s);
    const fs = freedomSim(s.prefs.freedom);
    return moneyLadder({
      cal: s.cal,
      safetyPot: safety ? this.core(s, safety) : null,
      essentialsPerMonth: m2(s.essentials),
      totalOwed: m2(this.people.totals(s).owe),
      debtMonthly: String(s.prefs.payback.monthly),
      payoffFree: plan.freeDate,
      freedomTarget: fs.target,
      freedomHitYear: fs.hitYear,
      age: s.prefs.freedom.age,
      investAccountOpens: '2027-07-01',
    });
  }

  private dto(s: Snapshot, p: PotRow): PotDto {
    const core = this.core(s, p);
    const target = potTarget(core, s.essentials);
    const reach = potReach(core, target, s.cal);
    const status = potStatus(core, s.cal);
    const state = !reach ? 'never' : 'reached' in reach ? 'reached' : 'never' in reach ? 'never' : 'on';
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      accountId: p.accountId,
      linkedAccountName: p.account?.name ?? null,
      balance: m2(core.balance),
      target: p.target ? money(p.target) : null,
      targetDate: core.targetDate,
      monthly: money(p.monthly),
      effectiveTarget: target.gt(0) ? m2(target) : null,
      reach: {
        state,
        date: reach && 'date' in reach ? reach.date : null,
        paydays: reach && 'k' in reach ? reach.k : null,
      },
      reachText: reachText(reach),
      status: status ? { late: status.late, need: status.need, paydaysLeft: status.paydaysLeft, shortfall: status.shortfall } : null,
      progress: target.gt(0) ? Math.min(100, D(core.balance).div(target).times(100).toNumber()) : 0,
    };
  }

  async get(userId: string): Promise<PotsShape> {
    return this.build(await this.snapshot.get(userId), userId);
  }

  async build(s: Snapshot, userId: string): Promise<PotsShape> {
    const wishes = await this.db.wishlistItem.findMany({ where: { userId }, orderBy: { addedOn: 'desc' } });
    const treat = s.pots.find((p) => p.type === 'TREAT');
    const accounts = await this.db.account.findMany({ where: { userId, type: 'VAULT' } });
    const treatBal = treat ? D(this.snapshot.potBalance(treat)) : D(0);
    const treatMonthly = treat ? D(treat.monthly.toString()) : D(0);
    return {
      pots: s.pots.map((p) => this.dto(s, p)),
      wishlist: wishes.map((w) => {
        const price = D(w.price.toString());
        const short = Decimal.max(0, price.minus(treatBal));
        const added = dateOnly(w.addedOn);
        return {
          id: w.id,
          potId: w.potId,
          name: w.name,
          price: money(w.price),
          addedOn: added,
          boughtOn: w.boughtOn ? dateOnly(w.boughtOn) : null,
          unlocksOn: price.gte(WISH_WAIT_OVER) ? addDays(added, WISH_WAIT_DAYS) : added,
          affordableOn: short.lte(0) ? s.today : treatMonthly.gt(0) ? nthPayday(s.today, s.user.paydayDayOfMonth, short.div(treatMonthly).ceil().toNumber(), true) : null,
        };
      }),
      ladder: this.ladder(s),
      essentialsPerMonth: m2(s.essentials),
      total: m2(sum(s.pots.map((p) => this.snapshot.potBalance(p)))),
      linkableAccounts: accounts.map((a) => ({ id: a.id, name: a.name, balance: money(a.balance) })),
    };
  }

  async create(userId: string, body: CreatePotBody): Promise<PotsShape> {
    if (body.accountId) await this.vault(userId, body.accountId);
    const count = await this.db.pot.count({ where: { userId } });
    await this.db.pot.create({
      data: {
        userId,
        name: body.name.trim(),
        type: body.type,
        target: body.target ? m2(body.target) : null,
        targetDate: body.targetDate ? parseDateOnly(body.targetDate) : null,
        monthly: m2(body.monthly),
        balance: m2(body.balance),
        accountId: body.accountId,
        sortOrder: count,
      },
    });
    return this.get(userId);
  }

  async update(userId: string, id: string, body: Partial<CreatePotBody>): Promise<PotsShape> {
    await this.owned(userId, id);
    if (body.accountId) await this.vault(userId, body.accountId);
    await this.db.pot.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.target !== undefined ? { target: body.target ? m2(body.target) : null } : {}),
        ...(body.targetDate !== undefined ? { targetDate: body.targetDate ? parseDateOnly(body.targetDate) : null } : {}),
        ...(body.monthly !== undefined ? { monthly: m2(body.monthly) } : {}),
        ...(body.balance !== undefined ? { balance: m2(body.balance) } : {}),
        ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
      },
    });
    return this.get(userId);
  }

  async remove(userId: string, id: string): Promise<PotsShape> {
    await this.owned(userId, id);
    await this.db.pot.update({ where: { id }, data: { archived: true, monthly: '0' } });
    return this.get(userId);
  }

  async addWish(userId: string, potId: string, body: { name: string; price: string }): Promise<PotsShape> {
    const pot = await this.owned(userId, potId);
    if (pot.type !== 'TREAT') throw new BadRequestException('Wishlist items live in a treat pot');
    await this.db.wishlistItem.create({
      data: { userId, potId, name: body.name.trim(), price: m2(body.price), addedOn: parseDateOnly(new Date().toISOString().slice(0, 10)) },
    });
    return this.get(userId);
  }

  async setWishBought(userId: string, id: string, bought: boolean): Promise<PotsShape> {
    const res = await this.db.wishlistItem.updateMany({
      where: { id, userId },
      data: { boughtOn: bought ? parseDateOnly(new Date().toISOString().slice(0, 10)) : null },
    });
    if (res.count === 0) throw new NotFoundException('Wishlist item not found');
    return this.get(userId);
  }

  async removeWish(userId: string, id: string): Promise<PotsShape> {
    await this.db.wishlistItem.deleteMany({ where: { id, userId } });
    return this.get(userId);
  }

  /** The three pots a new user starts with. */
  async provisionDefaults(userId: string): Promise<void> {
    if ((await this.db.pot.count({ where: { userId } })) > 0) return;
    await this.db.pot.createMany({
      data: [
        { userId, name: 'Rainy day', type: 'SAFETY', sortOrder: 0 },
        { userId, name: 'Treats', type: 'TREAT', sortOrder: 1 },
        { userId, name: 'Investment Account launch', type: 'INVESTING', target: '12000.00', targetDate: parseDateOnly('2027-07-01'), sortOrder: 2 },
      ],
    });
  }

  private async owned(userId: string, id: string) {
    const pot = await this.db.pot.findFirst({ where: { id, userId } });
    if (!pot) throw new NotFoundException('Pot not found');
    return pot;
  }

  private async vault(userId: string, accountId: string): Promise<void> {
    if (!(await this.db.account.findFirst({ where: { id: accountId, userId }, select: { id: true } }))) throw new BadRequestException('Unknown account');
  }
}
