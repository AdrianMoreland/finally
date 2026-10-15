import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  addVaultBody,
  askBody,
  askEvaluateBody,
  askResponse,
  billsSchema,
  bonusSchema,
  cancelRepeatingBody,
  chooseMonthBody,
  completeSetupBody,
  completeWeekBody,
  createPersonBody,
  createPersonPaymentBody,
  createPinBody,
  createPotBody,
  createWishBody,
  dismissBody,
  foundSchema,
  freedomSchema,
  investingPlanSchema,
  monthCloseSchema,
  monthSchema,
  paperSchema,
  paperTradeBody,
  paydayPlanSchema,
  peopleSchema,
  personSchema,
  pinSchema,
  potsSchema,
  setOrderBody,
  setTaxCheckBody,
  snoozeBody,
  taxSchema,
  todaySchema,
  updateBonusBody,
  updateFreedomBody,
  updateInvestingBody,
  updatePaybackPlanBody,
  updatePersonBody,
  updatePlanSettingsBody,
  updatePotBody,
  updateTaxBody,
  updateWishBody,
  userPrefs,
  userPrefsPatch,
  vaultSchema,
  weeklyReviewSchema,
} from '@finally/contracts';

export class TodayDto extends createZodDto(todaySchema) {}
export class SnoozeDto extends createZodDto(snoozeBody) {}
export class MonthDto extends createZodDto(monthSchema) {}
export class BillsDto extends createZodDto(billsSchema) {}
export class CancelRepeatingDto extends createZodDto(cancelRepeatingBody) {}
export class DismissDto extends createZodDto(dismissBody) {}

export class AskBodyDto extends createZodDto(askBody) {}
export class AskEvaluateDto extends createZodDto(askEvaluateBody) {}
export class AskResponseDto extends createZodDto(askResponse) {}
export class PinDto extends createZodDto(pinSchema) {}
export class PinListDto extends createZodDto(z.array(pinSchema)) {}
export class CreatePinDto extends createZodDto(createPinBody) {}

export class WeeklyReviewDto extends createZodDto(weeklyReviewSchema) {}
export class CompleteWeekDto extends createZodDto(completeWeekBody) {}
export class MonthCloseDto extends createZodDto(monthCloseSchema) {}
export class ChooseMonthDto extends createZodDto(chooseMonthBody) {}

export class PotsDto extends createZodDto(potsSchema) {}
export class CreatePotDto extends createZodDto(createPotBody) {}
export class UpdatePotDto extends createZodDto(updatePotBody) {}
export class CreateWishDto extends createZodDto(createWishBody) {}
export class UpdateWishDto extends createZodDto(updateWishBody) {}

export class PeopleDto extends createZodDto(peopleSchema) {}
export class PersonDto extends createZodDto(personSchema) {}
export class CreatePersonDto extends createZodDto(createPersonBody) {}
export class UpdatePersonDto extends createZodDto(updatePersonBody) {}
export class CreatePersonPaymentDto extends createZodDto(createPersonPaymentBody) {}
export class UpdatePaybackPlanDto extends createZodDto(updatePaybackPlanBody) {}

export class PaydayPlanDto extends createZodDto(paydayPlanSchema) {}
export class SetOrderDto extends createZodDto(setOrderBody) {}
export class UpdatePlanSettingsDto extends createZodDto(updatePlanSettingsBody) {}

export class BonusDto extends createZodDto(bonusSchema) {}
export class UpdateBonusDto extends createZodDto(updateBonusBody) {}
export class TaxDto extends createZodDto(taxSchema) {}
export class UpdateTaxDto extends createZodDto(updateTaxBody) {}
export class SetTaxCheckDto extends createZodDto(setTaxCheckBody) {}

export class InvestingPlanDto extends createZodDto(investingPlanSchema) {}
export class UpdateInvestingDto extends createZodDto(updateInvestingBody) {}
export class FreedomDto extends createZodDto(freedomSchema) {}
export class UpdateFreedomDto extends createZodDto(updateFreedomBody) {}
export class PaperDto extends createZodDto(paperSchema) {}
export class PaperTradeDto extends createZodDto(paperTradeBody) {}
export class VaultDto extends createZodDto(vaultSchema) {}
export class AddVaultDto extends createZodDto(addVaultBody) {}

export class FoundDto extends createZodDto(foundSchema) {}
export class CompleteSetupDto extends createZodDto(completeSetupBody) {}

export class PrefsDto extends createZodDto(userPrefs) {}
export class PrefsPatchDto extends createZodDto(userPrefsPatch) {}
