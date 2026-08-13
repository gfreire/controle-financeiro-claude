-- "Supermercado" was a default subcategory under "Alimentação"; promoted to its own
-- default EXPENSE category (decided 2026-08-11, at the user's request — it made more
-- sense as its own category in their own usage). Only touches the is_default catalog
-- (is_default = true, user_id is null) — never retroactively affects any user's own
-- copied categories/subcategories.

insert into categories (id, name, type, icon, color, is_system, is_default)
values (gen_random_uuid(), 'Supermercado', 'EXPENSE', '🛒', '#f97316', false, true);

delete from subcategories
where name = 'Supermercado'
  and category_id in (select id from categories where name = 'Alimentação' and is_default = true);
