export type TipoImovel = 'residencial' | 'galpao' | 'terreno'
export type FonteImovel = 'caixa' | 'bb' | 'tj_sp'
export type StatusOcupacao = 'ocupado' | 'desocupado' | 'desconhecido'
export type Recomendacao = 'oportunidade' | 'analisar_mais' | 'evitar'

export interface Imovel {
  id: string
  fonte: FonteImovel
  url_original: string
  titulo: string | null
  tipo: TipoImovel | null
  cidade: string | null
  bairro: string | null
  area_m2: number | null
  valor_avaliacao: number | null
  valor_minimo: number | null
  data_leilao: string | null
  status_ocupacao: StatusOcupacao
  descricao: string | null
  imagens: string[] | null
  raw_data: Record<string, unknown> | null
  analisado: boolean
  created_at: string
  updated_at: string
}

export interface Analise {
  id: string
  imovel_id: string
  analise_completa: string | null
  pontuacao: number | null
  valor_mercado_estimado: number | null
  desconto_percentual: number | null
  riscos: string[] | null
  pontos_positivos: string[] | null
  recomendacao: Recomendacao | null
  notificado: boolean
  created_at: string
}

export interface ImovelComAnalise extends Imovel {
  analises: Analise[]
}

export interface ExecucaoLog {
  id: string
  fonte: string
  total_encontrados: number
  novos: number
  analisados: number
  erros: number
  executado_em: string
}

export interface ImovelRaw {
  fonte: FonteImovel
  url_original: string
  titulo?: string
  tipo?: TipoImovel
  cidade?: string
  bairro?: string
  area_m2?: number
  valor_avaliacao?: number
  valor_minimo?: number
  data_leilao?: string
  status_ocupacao?: StatusOcupacao
  descricao?: string
  imagens?: string[]
  raw_data?: Record<string, unknown>
}
