-- Leilão Radar: schema inicial

create extension if not exists "uuid-ossp";

-- Imóveis encontrados nos leilões
create table if not exists imoveis (
  id uuid primary key default uuid_generate_v4(),
  fonte text not null, -- 'caixa' | 'bb' | 'tj_sp'
  url_original text unique not null,
  titulo text,
  tipo text, -- 'residencial' | 'galpao' | 'terreno'
  cidade text,
  bairro text,
  area_m2 numeric,
  valor_avaliacao numeric,
  valor_minimo numeric,
  data_leilao timestamptz,
  status_ocupacao text default 'desconhecido', -- 'ocupado' | 'desocupado' | 'desconhecido'
  descricao text,
  imagens text[],
  raw_data jsonb,
  analisado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Análises geradas pelo Claude
create table if not exists analises (
  id uuid primary key default uuid_generate_v4(),
  imovel_id uuid references imoveis(id) on delete cascade,
  analise_completa text,
  pontuacao integer check (pontuacao between 1 and 10),
  valor_mercado_estimado numeric,
  desconto_percentual numeric,
  riscos text[],
  pontos_positivos text[],
  recomendacao text, -- 'oportunidade' | 'analisar_mais' | 'evitar'
  notificado boolean default false,
  created_at timestamptz default now()
);

-- Log de execuções do scraper
create table if not exists execucoes_log (
  id uuid primary key default uuid_generate_v4(),
  fonte text,
  total_encontrados integer default 0,
  novos integer default 0,
  analisados integer default 0,
  erros integer default 0,
  executado_em timestamptz default now()
);

-- Índices para buscas comuns
create index if not exists idx_imoveis_cidade on imoveis(cidade);
create index if not exists idx_imoveis_tipo on imoveis(tipo);
create index if not exists idx_imoveis_analisado on imoveis(analisado);
create index if not exists idx_imoveis_data_leilao on imoveis(data_leilao);
create index if not exists idx_analises_imovel on analises(imovel_id);
create index if not exists idx_analises_pontuacao on analises(pontuacao);
create index if not exists idx_analises_recomendacao on analises(recomendacao);

-- Trigger para updated_at automático
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger imoveis_updated_at
  before update on imoveis
  for each row execute function update_updated_at();
