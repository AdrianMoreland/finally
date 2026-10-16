import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CreatePotDto, CreateWishDto, PotsDto, RefillDto, UpdatePotDto, UpdateWishDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { PotsService } from './pots.service';

@ApiTags('pots')
@ApiBearerAuth()
@Controller('pots')
export class PotsController {
  constructor(private readonly pots: PotsService) {}

  @Get()
  @ZodSerializerDto(PotsDto)
  get(@CurrentUser() user: AuthUser) {
    return this.pots.get(user.id);
  }

  @Post()
  @ZodSerializerDto(PotsDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePotDto) {
    return this.pots.create(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(PotsDto)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdatePotDto) {
    return this.pots.update(user.id, id, body);
  }

  @Delete(':id')
  @ZodSerializerDto(PotsDto)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pots.remove(user.id, id);
  }

  /**
   * You took money out of a pot in Revolut (Finally cannot move money). This records an extra amount to put back on
   * your next payday, which the payday plan then shows on that pot's standing order.
   */
  @Post(':id/refill')
  @ZodSerializerDto(PotsDto)
  refill(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RefillDto) {
    return this.pots.refill(user.id, id, body.amount);
  }

  @Delete(':id/refill')
  @ZodSerializerDto(PotsDto)
  undoRefill(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pots.undoRefill(user.id, id);
  }

  @Post(':id/wishlist')
  @ZodSerializerDto(PotsDto)
  addWish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CreateWishDto) {
    return this.pots.addWish(user.id, id, body);
  }

  @Patch('wishlist/:wishId')
  @ZodSerializerDto(PotsDto)
  setBought(@CurrentUser() user: AuthUser, @Param('wishId') wishId: string, @Body() body: UpdateWishDto) {
    return this.pots.setWishBought(user.id, wishId, body.bought);
  }

  @Delete('wishlist/:wishId')
  @ZodSerializerDto(PotsDto)
  removeWish(@CurrentUser() user: AuthUser, @Param('wishId') wishId: string) {
    return this.pots.removeWish(user.id, wishId);
  }
}
