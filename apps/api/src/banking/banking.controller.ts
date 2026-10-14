import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import {
  AccountDto,
  AccountListDto,
  ConnectionListDto,
  ImportCsvDto,
  ImportCsvResponseDto,
  OkDto,
  StartConnectionDto,
  StartConnectionResponseDto,
  SyncAllResponseDto,
  SyncResultDto,
  UpdateAccountDto,
} from '../common/dto';
import { Inject } from '@nestjs/common';
import { ENV, type Env } from '../common/env';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { BankingService } from './banking.service';

const bankingLimit = { default: { limit: 12, ttl: 60_000 } };

@ApiTags('banking')
@ApiBearerAuth()
@Controller()
export class BankingController {
  constructor(
    private readonly banking: BankingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('accounts')
  @ZodSerializerDto(AccountListDto)
  accounts(@CurrentUser() user: AuthUser) {
    return this.banking.listAccounts(user.id);
  }

  @Patch('accounts/:id')
  @ZodSerializerDto(AccountDto)
  updateAccount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateAccountDto) {
    return this.banking.updateAccount(user.id, id, body.includeInNetWorth);
  }

  @Get('banking/connections')
  @ZodSerializerDto(ConnectionListDto)
  connections(@CurrentUser() user: AuthUser) {
    return this.banking.listConnections(user.id);
  }

  @Post('banking/connections')
  @Throttle(bankingLimit)
  @ZodSerializerDto(StartConnectionResponseDto)
  start(@CurrentUser() user: AuthUser, @Body() body: StartConnectionDto) {
    return this.banking.startConnection(user.id, body.institution, body.returnTo);
  }

  /** Bank redirect target. Public because the bank, not the app, calls it. */
  @Public()
  @Get('banking/callback')
  @Throttle(bankingLimit)
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Res() res: Response) {
    const web = this.env.WEB_URL.replace(/\/$/, '');
    if (!code || !state) return res.redirect(`${web}/settings?bank=error`);
    try {
      const { userId, connectionId, returnTo } = await this.banking.completeConnection(code, state);
      void this.banking.syncConnection(userId, connectionId).catch(() => undefined);
      return res.redirect(returnTo === 'mobile' ? `${this.env.MOBILE_SCHEME}://banking/done` : `${web}/settings?bank=linked`);
    } catch {
      return res.redirect(`${web}/settings?bank=error`);
    }
  }

  @Post('banking/connections/:id/sync')
  @HttpCode(200)
  @Throttle(bankingLimit)
  @ZodSerializerDto(SyncResultDto)
  sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.banking.syncConnection(user.id, id);
  }

  /** Sync every linked connection (pull to refresh, app open). */
  @Post('banking/sync')
  @HttpCode(200)
  @Throttle(bankingLimit)
  @ZodSerializerDto(SyncAllResponseDto)
  async syncAll(@CurrentUser() user: AuthUser) {
    return { results: await this.banking.syncAll(user.id) };
  }

  @Delete('banking/connections/:id')
  @ZodSerializerDto(OkDto)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.banking.removeConnection(user.id, id);
    return { ok: true as const };
  }

  /** Statement CSV upload (AIB or Revolut export), through the same pipeline as a bank sync. */
  @Post('banking/import')
  @HttpCode(200)
  @Throttle(bankingLimit)
  @ZodSerializerDto(ImportCsvResponseDto)
  importCsv(@CurrentUser() user: AuthUser, @Body() body: ImportCsvDto) {
    return this.banking.importCsv(user.id, body);
  }
}
