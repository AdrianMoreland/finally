import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import {
  ListTransactionsQueryDto,
  RecategoriseTransactionDto,
  TransactionDto,
  TransactionPageDto,
  UpdateTransactionDto,
  UpdatedCountDto,
} from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly tx: TransactionsService) {}

  @Get()
  @ZodSerializerDto(TransactionPageDto)
  list(@CurrentUser() user: AuthUser, @Query() q: ListTransactionsQueryDto) {
    return this.tx.list(user.id, q);
  }

  @Get(':id')
  @ZodSerializerDto(TransactionDto)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tx.get(user.id, id);
  }

  @Patch(':id')
  @ZodSerializerDto(TransactionDto)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateTransactionDto) {
    return this.tx.patch(user.id, id, body);
  }

  @Post(':id/category')
  @HttpCode(200)
  @ZodSerializerDto(UpdatedCountDto)
  recategorise(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RecategoriseTransactionDto) {
    return this.tx.recategorise(user.id, id, body);
  }
}
