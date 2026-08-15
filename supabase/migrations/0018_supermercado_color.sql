-- "Supermercado" foi promovida de subcategoria de "Alimentação" pra categoria própria
-- (migration 0017) mas herdou a mesma cor laranja (#f97316) de Alimentação, então as
-- duas ficaram indistinguíveis em qualquer gráfico de categoria. Corrigido pra um
-- amarelo-dourado (#f59e0b, tom de carrinho de compras), distinto mas ainda na mesma
-- família "quente" de Alimentação. Só toca o catálogo is_default (user_id is null) —
-- nunca retroage sobre cópias já feitas por usuários (mesma regra da 0017).

update categories
set color = '#f59e0b'
where name = 'Supermercado'
  and is_default = true
  and user_id is null;
