import { Global, Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { SnapshotService } from './snapshot.service';

@Global()
@Module({ imports: [BudgetsModule], providers: [SnapshotService], exports: [SnapshotService] })
export class SnapshotModule {}
