import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import {
  CategoryDto,
  CategoryListDto,
  CreateCategoryDto,
  CreateRuleDto,
  OkDto,
  RuleDto,
  RuleListDto,
  UpdateCategoryDto,
  UpdateRuleDto,
} from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get('categories')
  @ZodSerializerDto(CategoryListDto)
  list(@CurrentUser() user: AuthUser) {
    return this.categories.list(user.id);
  }

  @Post('categories')
  @ZodSerializerDto(CategoryDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCategoryDto) {
    return this.categories.create(user.id, body);
  }

  @Patch('categories/:id')
  @ZodSerializerDto(CategoryDto)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.categories.update(user.id, id, body);
  }

  @Get('rules')
  @ZodSerializerDto(RuleListDto)
  rules(@CurrentUser() user: AuthUser) {
    return this.categories.listRules(user.id);
  }

  @Post('rules')
  @ZodSerializerDto(RuleDto)
  async createRule(@CurrentUser() user: AuthUser, @Body() body: CreateRuleDto) {
    const rule = await this.categories.createRule(user.id, body);
    await this.categories.reapply(user.id);
    return rule;
  }

  @Patch('rules/:id')
  @ZodSerializerDto(RuleDto)
  async updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateRuleDto) {
    const rule = await this.categories.updateRule(user.id, id, body);
    await this.categories.reapply(user.id);
    return rule;
  }

  @Delete('rules/:id')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.categories.deleteRule(user.id, id);
    return { ok: true as const };
  }
}
