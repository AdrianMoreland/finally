import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BankingModule } from '../banking/banking.module';
import { CategorisationModule } from '../categorisation/categorisation.module';
import { InsightsModule } from '../insights/insights.module';
import { SetupModule } from '../setup/setup.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OnboardingService } from './onboarding.service';
import { UsersService } from './users.service';

@Module({
  imports: [BankingModule, CategorisationModule, InsightsModule, SetupModule],
  providers: [UsersService, OnboardingService, JwtAuthGuard, { provide: APP_GUARD, useExisting: JwtAuthGuard }],
  exports: [UsersService, OnboardingService],
})
export class AuthModule {}
