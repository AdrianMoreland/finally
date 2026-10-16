-- Travel is planned in pots, so it is a root category with no budget line (it used to sit under "Everything else").
UPDATE "Category" SET "parentId" = NULL, "colour" = '#4CB7D9' WHERE "slug" = 'travel';
