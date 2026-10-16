import { Body, Controller, Delete, Get, HttpCode, Patch, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import { PrefsDto, PrefsPatchDto } from '../common/app-dto';
import { DeleteAllDataDto, ExportQueryDto, MeDto, OkDto, UpdateMeDto } from '../common/dto';
import { OnboardingService } from '../auth/onboarding.service';
import { CategorisationService } from '../categorisation/categorisation.service';
import { LedgerService } from '../data/ledger.service';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly ledger: LedgerService,
    private readonly categorisation: CategorisationService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  @ZodSerializerDto(MeDto)
  get(@CurrentUser() user: AuthUser) {
    return this.me.get(user.id);
  }

  @Patch()
  @ZodSerializerDto(MeDto)
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto) {
    return this.me.update(user.id, body);
  }

  /** Settings that are not entities: notifications, tax inputs, bonus, freedom and investing choices. */
  @Get('prefs')
  @ZodSerializerDto(PrefsDto)
  prefs(@CurrentUser() user: AuthUser) {
    return this.ledger.prefs(user.id);
  }

  @Patch('prefs')
  @ZodSerializerDto(PrefsDto)
  async patchPrefs(@CurrentUser() user: AuthUser, @Body() body: PrefsPatchDto) {
    const next = await this.ledger.patchPrefs(user.id, body);
    // Rent settings decide which credits are housemates' shares, so re-sort when they change.
    // The settings are saved either way; if re-sorting fails it runs again with the next sync.
    if ('rent' in body) await this.categorisation.reclassifyShares(user.id).catch(() => undefined);
    return next;
  }

  /** Download all data as JSON or the transactions as CSV. */
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto, @Res() res: Response) {
    const stamp = new Date().toISOString().slice(0, 10);
    if (q.format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="finally-transactions-${stamp}.csv"`);
      res.send(await this.me.exportCsv(user.id));
      return;
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="finally-export-${stamp}.json"`);
    res.send(JSON.stringify(await this.me.exportJson(user.id), null, 2));
  }

  /** Irreversible: removes all transactions, connections and settings data. */
  @Delete('data')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async deleteAll(@CurrentUser() user: AuthUser, @Body() _body: DeleteAllDataDto) {
    await this.me.deleteAllData(user.id);
    // Start again as a brand-new user: with the mock bank, the next request re-links the demo account.
    this.onboarding.reset(user.id);
    return { ok: true as const };
  }
}
