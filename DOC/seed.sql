-- ============================================
-- SYSTEM CATEGORIES (not editable by user)
-- ============================================

insert into categories (id, name, type, icon, color, is_system, is_default)
values
(gen_random_uuid(), 'Juros', 'EXPENSE', '💳', '#475569', true, false),
(gen_random_uuid(), 'Rendimentos', 'INCOME', '📈', '#22c55e', true, false),
(gen_random_uuid(), 'Ajuste', 'INCOME', '⚖️', '#a855f7', true, false),
(gen_random_uuid(), 'Ajuste', 'EXPENSE', '⚖️', '#a855f7', true, false);
-- ADICIONADO: faltavam as 2 linhas de "Ajuste" (INCOME e EXPENSE) definidas
-- na sessão de replanejamento — saída do reconcileAccountBalance ("Ajustar
-- Saldo"), separado de Rendimentos (que é o registerYield/"Informar Rendimento").

-- ============================================
-- DEFAULT EXPENSE CATEGORIES
-- ============================================

insert into categories (id, name, type, icon, color, is_system, is_default)
values
(gen_random_uuid(), 'Moradia', 'EXPENSE', '🏠', '#ef4444', false, true),
(gen_random_uuid(), 'Alimentação', 'EXPENSE', '🍔', '#f97316', false, true),
(gen_random_uuid(), 'Transporte', 'EXPENSE', '🚗', '#eab308', false, true),
(gen_random_uuid(), 'Saúde', 'EXPENSE', '❤️', '#22c55e', false, true),
(gen_random_uuid(), 'Educação', 'EXPENSE', '📚', '#3b82f6', false, true),
(gen_random_uuid(), 'Filhos', 'EXPENSE', '👶', '#f43f5e', false, true),
(gen_random_uuid(), 'Lazer', 'EXPENSE', '🎮', '#8b5cf6', false, true),
(gen_random_uuid(), 'Vida Social', 'EXPENSE', '🍻', '#ec4899', false, true),
(gen_random_uuid(), 'Compras', 'EXPENSE', '🛍️', '#d946ef', false, true),
(gen_random_uuid(), 'Assinaturas', 'EXPENSE', '💻', '#6366f1', false, true),
(gen_random_uuid(), 'Pets', 'EXPENSE', '🐶', '#10b981', false, true),
(gen_random_uuid(), 'Viagem', 'EXPENSE', '✈️', '#0ea5e9', false, true),
(gen_random_uuid(), 'Impostos', 'EXPENSE', '🧾', '#64748b', false, true),
(gen_random_uuid(), 'Financeiro', 'EXPENSE', '💳', '#475569', false, true),
(gen_random_uuid(), 'Dívidas', 'EXPENSE', '📉', '#b91c1c', false, true),
(gen_random_uuid(), 'Doações', 'EXPENSE', '🤝', '#a855f7', false, true),
(gen_random_uuid(), 'Outros', 'EXPENSE', '📦', '#94a3b8', false, true),
(gen_random_uuid(), 'Cuidados Pessoais', 'EXPENSE', '🧴', '#fb7185', false, true), -- SUGESTÃO NOVA
(gen_random_uuid(), 'Supermercado', 'EXPENSE', '🛒', '#f59e0b', false, true); -- promovida de subcategoria de Alimentação (0017); cor própria (0018) — herdava a mesma laranja de Alimentação

-- ============================================
-- DEFAULT INCOME CATEGORIES (NO SUBCATEGORIES)
-- ============================================

insert into categories (id, name, type, icon, color, is_system, is_default)
values
(gen_random_uuid(), 'Salário', 'INCOME', '💰', '#16a34a', false, true),
(gen_random_uuid(), 'Freelance', 'INCOME', '💼', '#0284c7', false, true),
(gen_random_uuid(), 'Investimentos', 'INCOME', '📈', '#6366f1', false, true),
(gen_random_uuid(), 'Vendas', 'INCOME', '🏷️', '#f97316', false, true),
(gen_random_uuid(), 'Reembolsos', 'INCOME', '🔄', '#14b8a6', false, true),
(gen_random_uuid(), 'Presentes / Doações', 'INCOME', '🎁', '#ec4899', false, true),
(gen_random_uuid(), 'Recebimento de Dívida', 'INCOME', '📥', '#22c55e', false, true),
(gen_random_uuid(), 'Outras Receitas', 'INCOME', '💵', '#94a3b8', false, true);

-- ============================================
-- SUBCATEGORIES
-- ============================================

-- MORADIA

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Aluguel', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Condomínio', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Energia', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Água', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Gás', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Internet', id from categories where name = 'Moradia';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Manutenção', id from categories where name = 'Moradia';


-- ALIMENTAÇÃO

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Padaria', id from categories where name = 'Alimentação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Restaurante', id from categories where name = 'Alimentação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Delivery', id from categories where name = 'Alimentação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Café', id from categories where name = 'Alimentação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Bar', id from categories where name = 'Alimentação';


-- TRANSPORTE

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Combustível', id from categories where name = 'Transporte';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Uber / Táxi', id from categories where name = 'Transporte';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Transporte Público', id from categories where name = 'Transporte';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Estacionamento', id from categories where name = 'Transporte';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Pedágio', id from categories where name = 'Transporte';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Manutenção do Veículo', id from categories where name = 'Transporte';


-- FILHOS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Fraldas', id from categories where name = 'Filhos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Leite / Fórmula', id from categories where name = 'Filhos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Roupas', id from categories where name = 'Filhos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Brinquedos', id from categories where name = 'Filhos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Material Escolar', id from categories where name = 'Filhos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Babá', id from categories where name = 'Filhos';


-- LAZER

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Cinema', id from categories where name = 'Lazer';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Shows', id from categories where name = 'Lazer';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Eventos', id from categories where name = 'Lazer';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Passeios', id from categories where name = 'Lazer';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Jogos', id from categories where name = 'Lazer';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Parques', id from categories where name = 'Lazer';


-- VIDA SOCIAL

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Happy Hour', id from categories where name = 'Vida Social';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Saídas com Amigos', id from categories where name = 'Vida Social';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Aniversários', id from categories where name = 'Vida Social';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Casamentos', id from categories where name = 'Vida Social';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Eventos Sociais', id from categories where name = 'Vida Social';


-- COMPRAS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Roupas', id from categories where name = 'Compras';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Calçados', id from categories where name = 'Compras';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Eletrônicos', id from categories where name = 'Compras';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Casa', id from categories where name = 'Compras';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Presentes', id from categories where name = 'Compras';


-- DOAÇÕES

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Instituições', id from categories where name = 'Doações';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Amigos', id from categories where name = 'Doações';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Pessoas na Rua', id from categories where name = 'Doações';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Criadores / Streamers', id from categories where name = 'Doações';

-- SAÚDE

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Farmácia', id from categories where name = 'Saúde';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Consultas', id from categories where name = 'Saúde';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Exames', id from categories where name = 'Saúde';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Plano de Saúde', id from categories where name = 'Saúde';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Terapia', id from categories where name = 'Saúde';


-- EDUCAÇÃO

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Cursos', id from categories where name = 'Educação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Faculdade', id from categories where name = 'Educação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Livros', id from categories where name = 'Educação';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Material Escolar', id from categories where name = 'Educação';


-- PETS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Ração', id from categories where name = 'Pets';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Veterinário', id from categories where name = 'Pets';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Medicamentos', id from categories where name = 'Pets';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Acessórios', id from categories where name = 'Pets';


-- VIAGEM

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Passagens', id from categories where name = 'Viagem';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Hospedagem', id from categories where name = 'Viagem';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Passeios', id from categories where name = 'Viagem';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Alimentação em Viagem', id from categories where name = 'Viagem';


-- IMPOSTOS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'IPVA', id from categories where name = 'Impostos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'IPTU', id from categories where name = 'Impostos';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Imposto de Renda', id from categories where name = 'Impostos';


-- FINANCEIRO

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Tarifas Bancárias', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Anuidade de Cartão', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Multas', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Seguro Auto', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Seguro Residencial', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Seguro de Vida', id from categories where name = 'Financeiro';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Seguro Saúde', id from categories where name = 'Financeiro';
-- SUGESTÃO NOVA: "Seguros" não tinha nenhuma subcategoria — nem em Financeiro nem em nenhum outro lugar.


-- DÍVIDAS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Pagamento de Empréstimo', id from categories where name = 'Dívidas';

-- REMOVIDO: "Pagamento de Cartão" tirado do pacote padrão de propósito. Pagar a fatura do
-- cartão já é implícito na transferência CASH/BANK -> CREDIT_CARD (CREDIT_CARD_PAYMENT) e nunca
-- leva categoria — o gasto real já aparece nas compras do cartão. Ter essa subcategoria aqui só
-- convidava o usuário a lançar o pagamento errado, como despesa categorizada em vez de transferência.

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Acordos de Dívida', id from categories where name = 'Dívidas';


-- OUTROS

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Diversos', id from categories where name = 'Outros';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Imprevistos', id from categories where name = 'Outros';


-- ASSINATURAS
-- SUGESTÃO NOVA: "Assinaturas" não tinha NENHUMA subcategoria no seed original,
-- apesar de ser uma categoria bem provável de ter fixed_expenses associadas
-- (streaming, IA, etc. — exatamente o exemplo usado na sessão de replanejamento).

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Streaming', id from categories where name = 'Assinaturas';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Música', id from categories where name = 'Assinaturas';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Produtividade / IA', id from categories where name = 'Assinaturas';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Nuvem / Armazenamento', id from categories where name = 'Assinaturas';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Notícias / Revistas', id from categories where name = 'Assinaturas';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Aplicativos', id from categories where name = 'Assinaturas';


-- CUIDADOS PESSOAIS (SUGESTÃO NOVA — categoria inteira)

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Cabeleireiro / Barbearia', id from categories where name = 'Cuidados Pessoais';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Estética', id from categories where name = 'Cuidados Pessoais';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Cosméticos', id from categories where name = 'Cuidados Pessoais';

insert into subcategories (id, name, category_id)
select gen_random_uuid(), 'Academia', id from categories where name = 'Cuidados Pessoais';


-- ============================================
-- FINANCIAL INSTITUTIONS
-- Sem coluna `icon` — decidido remover, fica só `color` mesmo.
--
-- Cores confirmadas contra manual de marca oficial: Nubank, Banco do Brasil.
-- C6 Bank: identidade é preto/branco/marble, sem um hex de acento único
-- documentado publicamente — usei preto como aproximação razoável.
-- Itaú/Bradesco/Santander/Inter/Caixa/Mercado Pago/PicPay: cores amplamente
-- reconhecidas, mas não confirmadas contra manual de marca oficial nesta
-- pesquisa — vale checar antes de reproduzir num produto real.
-- Neon/Digio/Next/PagBank/BTG Pactual/Banco Pan: aproximações de memória,
-- não localizei confirmação nem ampla nem oficial nesta pesquisa — checar
-- com mais cuidado antes de usar num produto real.
--
-- Cartões de loja (Amazon, Magazine Luiza etc.) NÃO viram linha própria
-- aqui — eles são emitidos por um banco de verdade por trás:
--   - Cartão Amazon -> emitido pela Bradescard (grupo Bradesco)
--   - Cartão Magazine Luiza -> emitido via Luizacred (joint venture com Itaú)
-- Pra modelar isso no app: cria a `account` normalmente com o nome que o
-- usuário reconhece ("Cartão Amazon", "Cartão Magalu") e aponta o
-- institution_id pro banco real (Bradesco ou Itaú) — não precisa de linha
-- nova no catálogo pra cada cartão de loja.
-- ============================================

insert into financial_institutions (id, name, color)
values
(gen_random_uuid(), 'Nubank', '#820AD1'),
(gen_random_uuid(), 'C6 Bank', '#000000'),
(gen_random_uuid(), 'Banco do Brasil', '#0038A8'),
(gen_random_uuid(), 'Itaú', '#EC7000'),
(gen_random_uuid(), 'Bradesco', '#CC092F'),
(gen_random_uuid(), 'Santander', '#EC0000'),
(gen_random_uuid(), 'Banco Inter', '#FF7A00'),
(gen_random_uuid(), 'Caixa Econômica Federal', '#0033A0'),
(gen_random_uuid(), 'Mercado Pago', '#00AAFF'),
(gen_random_uuid(), 'PicPay', '#21C25E'),
(gen_random_uuid(), 'Neon', '#00C2A8'),
(gen_random_uuid(), 'Digio', '#FF6B00'),
(gen_random_uuid(), 'Next', '#8A05BE'),
(gen_random_uuid(), 'PagBank', '#00A868'),
(gen_random_uuid(), 'BTG Pactual', '#0A2540'),
(gen_random_uuid(), 'Banco Pan', '#FFC800'),
(gen_random_uuid(), 'InfinitePay', '#00D26A'),
(gen_random_uuid(), 'Méliuz', '#FF7A1A');
-- Cores dessas duas: aproximação de memória, sem confirmação nesta pesquisa.