import { createZodDto } from 'nestjs-zod';
import {
  accountSchema,
  answerCategoriseBody,
  budgetsQuery,
  budgetsResponse,
  categoriseQueueResponse,
  categorySchema,
  compoundBody,
  compoundResponse,
  connectionSchema,
  convertQuery,
  convertResponse,
  createCategoryBody,
  createGoalBody,
  createInstrumentBody,
  createLotBody,
  createRuleBody,
  deleteAllDataBody,
  emergencyFundResponse,
  exportQuery,
  fireBody,
  fireResponse,
  goalSchema,
  importCsvBody,
  importCsvResponse,
  insightsResponse,
  instrumentSchema,
  investmentsSchema,
  listTransactionsQuery,
  loanBody,
  loanResponse,
  lotSchema,
  meSchema,
  okResponse,
  priceSeriesQuery,
  priceSeriesSchema,
  recategoriseTransactionBody,
  recurringSchema,
  registerDeviceBody,
  ruleSchema,
  signalSchema,
  startConnectionBody,
  startConnectionResponse,
  syncAllResponse,
  syncResultSchema,
  taxRuleSchema,
  testNotificationResponse,
  transactionPage,
  transactionSchema,
  updateAccountBody,
  updateCategoryBody,
  updateGoalBody,
  updateInstrumentBody,
  updateLotBody,
  updateMeBody,
  updateRuleBody,
  updateTransactionBody,
  updatedCountResponse,
  upsertBudgetBody,
  whereShouldItGoBody,
  whereShouldItGoResponse,
  overviewSchema,
} from '@finally/contracts';
import { z } from 'zod';

export class MeDto extends createZodDto(meSchema) {}
export class UpdateMeDto extends createZodDto(updateMeBody) {}
export class DeleteAllDataDto extends createZodDto(deleteAllDataBody) {}
export class ExportQueryDto extends createZodDto(exportQuery) {}
export class OkDto extends createZodDto(okResponse) {}

export class CategoryDto extends createZodDto(categorySchema) {}
export class CategoryListDto extends createZodDto(z.array(categorySchema)) {}
export class CreateCategoryDto extends createZodDto(createCategoryBody) {}
export class UpdateCategoryDto extends createZodDto(updateCategoryBody) {}
export class RuleDto extends createZodDto(ruleSchema) {}
export class RuleListDto extends createZodDto(z.array(ruleSchema)) {}
export class CreateRuleDto extends createZodDto(createRuleBody) {}
export class UpdateRuleDto extends createZodDto(updateRuleBody) {}

export class AccountListDto extends createZodDto(z.array(accountSchema)) {}
export class AccountDto extends createZodDto(accountSchema) {}
export class UpdateAccountDto extends createZodDto(updateAccountBody) {}
export class ConnectionDto extends createZodDto(connectionSchema) {}
export class ConnectionListDto extends createZodDto(z.array(connectionSchema)) {}
export class StartConnectionDto extends createZodDto(startConnectionBody) {}
export class StartConnectionResponseDto extends createZodDto(startConnectionResponse) {}
export class SyncResultDto extends createZodDto(syncResultSchema) {}
export class SyncAllResponseDto extends createZodDto(syncAllResponse) {}
export class ImportCsvDto extends createZodDto(importCsvBody) {}
export class ImportCsvResponseDto extends createZodDto(importCsvResponse) {}

export class ListTransactionsQueryDto extends createZodDto(listTransactionsQuery) {}
export class TransactionPageDto extends createZodDto(transactionPage) {}
export class TransactionDto extends createZodDto(transactionSchema) {}
export class UpdateTransactionDto extends createZodDto(updateTransactionBody) {}
export class RecategoriseTransactionDto extends createZodDto(recategoriseTransactionBody) {}
export class UpdatedCountDto extends createZodDto(updatedCountResponse) {}

export class CategoriseQueueDto extends createZodDto(categoriseQueueResponse) {}
export class AnswerCategoriseDto extends createZodDto(answerCategoriseBody) {}
export class RegisterDeviceDto extends createZodDto(registerDeviceBody) {}
export class TestNotificationDto extends createZodDto(testNotificationResponse) {}

export class BudgetsQueryDto extends createZodDto(budgetsQuery) {}
export class BudgetsDto extends createZodDto(budgetsResponse) {}
export class UpsertBudgetDto extends createZodDto(upsertBudgetBody) {}
export class GoalDto extends createZodDto(goalSchema) {}
export class GoalListDto extends createZodDto(z.array(goalSchema)) {}
export class CreateGoalDto extends createZodDto(createGoalBody) {}
export class UpdateGoalDto extends createZodDto(updateGoalBody) {}
export class InsightsDto extends createZodDto(insightsResponse) {}
export class OverviewDto extends createZodDto(overviewSchema) {}
export class RecurringListDto extends createZodDto(z.array(recurringSchema)) {}

export class InstrumentDto extends createZodDto(instrumentSchema) {}
export class InstrumentListDto extends createZodDto(z.array(instrumentSchema)) {}
export class CreateInstrumentDto extends createZodDto(createInstrumentBody) {}
export class UpdateInstrumentDto extends createZodDto(updateInstrumentBody) {}
export class LotDto extends createZodDto(lotSchema) {}
export class LotListDto extends createZodDto(z.array(lotSchema)) {}
export class CreateLotDto extends createZodDto(createLotBody) {}
export class UpdateLotDto extends createZodDto(updateLotBody) {}
export class InvestmentsDto extends createZodDto(investmentsSchema) {}
export class SignalListDto extends createZodDto(z.array(signalSchema)) {}
export class TaxRuleListDto extends createZodDto(z.array(taxRuleSchema)) {}
export class PriceSeriesQueryDto extends createZodDto(priceSeriesQuery) {}
export class PriceSeriesDto extends createZodDto(priceSeriesSchema) {}

export class CompoundDto extends createZodDto(compoundBody) {}
export class CompoundResponseDto extends createZodDto(compoundResponse) {}
export class EmergencyFundDto extends createZodDto(emergencyFundResponse) {}
export class FireDto extends createZodDto(fireBody) {}
export class FireResponseDto extends createZodDto(fireResponse) {}
export class LoanDto extends createZodDto(loanBody) {}
export class LoanResponseDto extends createZodDto(loanResponse) {}
export class WhereDto extends createZodDto(whereShouldItGoBody) {}
export class WhereResponseDto extends createZodDto(whereShouldItGoResponse) {}
export class ConvertQueryDto extends createZodDto(convertQuery) {}
export class ConvertResponseDto extends createZodDto(convertResponse) {}
