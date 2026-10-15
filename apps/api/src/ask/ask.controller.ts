import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { AskBodyDto, AskEvaluateDto, AskResponseDto, CreatePinDto, PinListDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { AskService } from './ask.service';

@ApiTags('ask')
@ApiBearerAuth()
@Controller('ask')
export class AskController {
  constructor(private readonly ask: AskService) {}

  /** Understand and answer a typed question. Spending questions never leave this server. */
  @Post()
  @ZodSerializerDto(AskResponseDto)
  post(@CurrentUser() user: AuthUser, @Body() body: AskBodyDto) {
    return this.ask.ask(user.id, body.text, body.previous);
  }

  /** Re-run a question after the "Read as" chips were edited. */
  @Post('evaluate')
  @ZodSerializerDto(AskResponseDto)
  evaluate(@CurrentUser() user: AuthUser, @Body() body: AskEvaluateDto) {
    return this.ask.evaluate(user.id, body.query);
  }

  @Get('suggestions')
  suggestions() {
    return { items: this.ask.suggestions() };
  }

  @Get('pins')
  @ZodSerializerDto(PinListDto)
  pins(@CurrentUser() user: AuthUser) {
    return this.ask.pins(user.id);
  }

  @Post('pins')
  @ZodSerializerDto(PinListDto)
  pin(@CurrentUser() user: AuthUser, @Body() body: CreatePinDto) {
    return this.ask.pin(user.id, body.text);
  }

  @Delete('pins/:id')
  @ZodSerializerDto(PinListDto)
  unpin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ask.unpin(user.id, id);
  }
}
