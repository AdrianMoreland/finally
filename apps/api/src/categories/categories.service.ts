import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type {
  CategoryDto,
  CreateCategoryBody,
  CreateRuleBody,
  RuleDto,
  UpdateCategoryBody,
} from '@finally/contracts';
import { InjectDb } from '../common/tokens';
import { CategorisationService } from '../categorisation/categorisation.service';
import { JobsService } from '../jobs/jobs.service';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type CategoryRow = {
  id: string; name: string; slug: string; group: CategoryDto['group']; askGroup: CategoryDto['askGroup'];
  icon: string; colour: string; parentId: string | null; archived: boolean;
};
const toCategory = (c: CategoryRow): CategoryDto => ({
  id: c.id, name: c.name, slug: c.slug, group: c.group, askGroup: c.askGroup, icon: c.icon,
  colour: c.colour, parentId: c.parentId, archived: c.archived,
});

@Injectable()
export class CategoriesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly categorisation: CategorisationService,
    private readonly jobs: JobsService,
  ) {}

  async list(userId: string): Promise<CategoryDto[]> {
    const rows = await this.db.category.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(toCategory);
  }

  async create(userId: string, body: CreateCategoryBody): Promise<CategoryDto> {
    const base = slugify(body.name) || 'category';
    let slug = base;
    for (let n = 2; await this.db.category.findUnique({ where: { userId_slug: { userId, slug } } }); n++) slug = `${base}-${n}`;
    if (body.parentId) {
      const parent = await this.db.category.findFirst({ where: { id: body.parentId, userId } });
      if (!parent || parent.parentId) throw new BadRequestException('Parent must be a top-level category');
    }
    const max = await this.db.category.aggregate({ where: { userId }, _max: { sortOrder: true } });
    const row = await this.db.category.create({
      data: { ...body, userId, slug, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return toCategory(row);
  }

  async update(userId: string, id: string, body: UpdateCategoryBody): Promise<CategoryDto> {
    const existing = await this.db.category.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Category not found');
    if (body.parentId === id) throw new BadRequestException('A category cannot be its own parent');
    const row = await this.db.category.update({ where: { id }, data: body });
    return toCategory(row);
  }

  /* ----------------------------------------------------------- rules */

  private toRule(r: { id: string; matchType: RuleDto['matchType']; pattern: string; categoryId: string; priority: number; source: RuleDto['source']; active: boolean }): RuleDto {
    return { id: r.id, matchType: r.matchType, pattern: r.pattern, categoryId: r.categoryId, priority: r.priority, source: r.source, active: r.active };
  }

  async listRules(userId: string): Promise<RuleDto[]> {
    const rows = await this.db.merchantRule.findMany({ where: { userId }, orderBy: [{ source: 'desc' }, { priority: 'desc' }, { pattern: 'asc' }] });
    return rows.map((r) => this.toRule(r));
  }

  async createRule(userId: string, body: CreateRuleBody): Promise<RuleDto> {
    if (body.matchType === 'REGEX') {
      try {
        new RegExp(body.pattern);
      } catch {
        throw new BadRequestException('Invalid regular expression');
      }
    }
    const cat = await this.db.category.findFirst({ where: { id: body.categoryId, userId } });
    if (!cat) throw new BadRequestException('Unknown category');
    const row = await this.db.merchantRule.upsert({
      where: { userId_source_matchType_pattern: { userId, source: 'USER', matchType: body.matchType, pattern: body.pattern } },
      update: { categoryId: body.categoryId, priority: body.priority, active: true },
      create: { userId, source: 'USER', matchType: body.matchType, pattern: body.pattern, categoryId: body.categoryId, priority: body.priority },
    });
    return this.toRule(row);
  }

  async updateRule(userId: string, id: string, body: { categoryId?: string; priority?: number; active?: boolean }): Promise<RuleDto> {
    const rule = await this.db.merchantRule.findFirst({ where: { id, userId } });
    if (!rule) throw new NotFoundException('Rule not found');
    const row = await this.db.merchantRule.update({ where: { id }, data: body });
    return this.toRule(row);
  }

  async deleteRule(userId: string, id: string): Promise<void> {
    const res = await this.db.merchantRule.deleteMany({ where: { id, userId, source: 'USER' } });
    if (res.count === 0) throw new NotFoundException('Rule not found (seed rules can be switched off instead)');
  }

  /** Re-run rules against payments that are still unsorted (after adding or editing a rule). */
  async reapply(userId: string): Promise<void> {
    await this.jobs.enqueue('categorise', { userId }, `categorise:${userId}`);
  }

  get categorisationService(): CategorisationService {
    return this.categorisation;
  }
}
