import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { ImovelCard } from '@/components/ImovelCard'
import { FiltroBar } from '@/components/FiltroBar'
import type { ImovelComAnalise } from '@/types'

interface SearchParams {
  tipo?: string
  cidade?: string
  recomendacao?: string
  ordem?: string
}

async function buscarImoveis(params: SearchParams): Promise<ImovelComAnalise[]> {
  let query = supabase
    .from('imoveis')
    .select('*, analises(*)')

  if (params.tipo) query = query.eq('tipo', params.tipo)
  if (params.cidade) query = query.ilike('cidade', `%${params.cidade}%`)

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(100)

  if (!data) return []

  let imoveis = data as ImovelComAnalise[]

  if (params.recomendacao) {
    imoveis = imoveis.filter(im => im.analises?.[0]?.recomendacao === params.recomendacao)
  }

  const ordem = params.ordem ?? 'pontuacao'
  imoveis = imoveis.sort((a, b) => {
    const analiseA = a.analises?.[0]
    const analiseB = b.analises?.[0]
    if (ordem === 'pontuacao') {
      return (analiseB?.pontuacao ?? 0) - (analiseA?.pontuacao ?? 0)
    }
    if (ordem === 'data_leilao') {
      return new Date(a.data_leilao ?? '').getTime() - new Date(b.data_leilao ?? '').getTime()
    }
    if (ordem === 'valor_minimo') {
      return (a.valor_minimo ?? Infinity) - (b.valor_minimo ?? Infinity)
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return imoveis
}

async function buscarStats() {
  const [{ count: total }, { count: oportunidades }, { count: pendentes }] = await Promise.all([
    supabase.from('imoveis').select('*', { count: 'exact', head: true }),
    supabase.from('analises').select('*', { count: 'exact', head: true }).eq('recomendacao', 'oportunidade'),
    supabase.from('imoveis').select('*', { count: 'exact', head: true }).eq('analisado', false),
  ])
  return { total: total ?? 0, oportunidades: oportunidades ?? 0, pendentes: pendentes ?? 0 }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [imoveis, stats] = await Promise.all([buscarImoveis(params), buscarStats()])

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leilão Radar</h1>
            <p className="text-xs text-gray-500">Monitoramento de imóveis em leilão — SP</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-lg font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Imóveis</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-600">{stats.oportunidades}</p>
              <p className="text-xs text-gray-500">Oportunidades</p>
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-600">{stats.pendentes}</p>
              <p className="text-xs text-gray-500">Pendentes análise</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Suspense fallback={null}>
            <FiltroBar />
          </Suspense>
        </div>

        {imoveis.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">Nenhum imóvel encontrado</p>
            <p className="text-gray-300 text-sm mt-2">
              O scraper ainda não rodou ou nenhum imóvel passa nos filtros selecionados.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{imoveis.length} imóveis encontrados</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {imoveis.map(imovel => (
                <ImovelCard key={imovel.id} imovel={imovel} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
