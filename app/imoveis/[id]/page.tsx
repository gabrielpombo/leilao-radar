import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ImovelComAnalise } from '@/types'

function formatarMoeda(valor: number | null) {
  if (!valor) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default async function ImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabase
    .from('imoveis')
    .select('*, analises(*)')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const imovel = data as ImovelComAnalise
  const analise = imovel.analises?.[0]

  const desconto = imovel.valor_avaliacao && imovel.valor_minimo
    ? Math.round((1 - imovel.valor_minimo / imovel.valor_avaliacao) * 100)
    : null

  const tipoLabel: Record<string, string> = {
    residencial: 'Residencial',
    galpao: 'Galpão',
    terreno: 'Terreno',
  }

  const recomendacaoConfig: Record<string, { cor: string; label: string }> = {
    oportunidade: { cor: 'bg-green-100 text-green-800 border-green-200', label: '✅ Oportunidade' },
    analisar_mais: { cor: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '🟡 Analisar Mais' },
    evitar: { cor: 'bg-red-100 text-red-800 border-red-200', label: '🔴 Evitar' },
  }

  const recConfig = analise?.recomendacao ? recomendacaoConfig[analise.recomendacao] : null

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Voltar</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium truncate">{imovel.titulo || 'Imóvel'}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card principal */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-1">
                    {imovel.fonte.toUpperCase()} · {tipoLabel[imovel.tipo ?? ''] ?? imovel.tipo}
                  </p>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {imovel.titulo || `${tipoLabel[imovel.tipo ?? ''] ?? 'Imóvel'} em ${imovel.cidade}`}
                  </h1>
                  <p className="text-gray-500 mt-1">
                    📍 {imovel.cidade || '—'}{imovel.bairro ? ` / ${imovel.bairro}` : ''}
                    {imovel.area_m2 ? ` · ${imovel.area_m2} m²` : ''}
                  </p>
                </div>
                {analise?.pontuacao && (
                  <div className="text-center shrink-0">
                    <p className="text-4xl font-bold text-gray-900">{analise.pontuacao}</p>
                    <p className="text-xs text-gray-400">de 10</p>
                  </div>
                )}
              </div>

              {recConfig && (
                <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-semibold border ${recConfig.cor}`}>
                  {recConfig.label}
                </span>
              )}

              {/* Valores */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Valor de Avaliação</p>
                  <p className="text-lg font-semibold text-gray-700">{formatarMoeda(imovel.valor_avaliacao)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Lance Mínimo</p>
                  <p className="text-lg font-bold text-gray-900">{formatarMoeda(imovel.valor_minimo)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Desconto</p>
                  <p className={`text-lg font-bold ${desconto && desconto > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {desconto !== null && desconto > 0 ? `-${desconto}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
                <div>
                  <p className="text-gray-400">Data do Leilão</p>
                  <p className="text-gray-700 font-medium">
                    {imovel.data_leilao ? new Date(imovel.data_leilao).toLocaleDateString('pt-BR') : 'A confirmar'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Situação</p>
                  <p className={`font-medium ${
                    imovel.status_ocupacao === 'desocupado' ? 'text-green-600' :
                    imovel.status_ocupacao === 'ocupado' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {imovel.status_ocupacao === 'desocupado' ? '✅ Desocupado' :
                     imovel.status_ocupacao === 'ocupado' ? '⚠️ Ocupado' : '❓ Desconhecido'}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <a
                  href={imovel.url_original}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  Ver no site original ↗
                </a>
              </div>
            </div>

            {/* Descrição */}
            {imovel.descricao && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 mb-3">Descrição</h2>
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{imovel.descricao}</p>
              </div>
            )}

            {/* Análise completa */}
            {analise?.analise_completa && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Análise Completa</h2>
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{analise.analise_completa}</p>

                {/* Valor de mercado estimado */}
                {analise.valor_mercado_estimado && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 font-medium">Valor de mercado estimado</p>
                    <p className="text-blue-900 font-bold">
                      {formatarMoeda(analise.valor_mercado_estimado)}
                      {analise.desconto_percentual && (
                        <span className="text-green-600 font-normal text-sm ml-2">
                          ({Math.round(analise.desconto_percentual)}% de desconto real)
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Pontos positivos */}
            {analise?.pontos_positivos && analise.pontos_positivos.length > 0 && (
              <div className="bg-green-50 rounded-xl border border-green-100 p-5">
                <h3 className="font-semibold text-green-900 mb-3 text-sm">Pontos Positivos</h3>
                <ul className="space-y-2">
                  {analise.pontos_positivos.map((ponto, i) => (
                    <li key={i} className="text-sm text-green-800 flex gap-2">
                      <span className="shrink-0">✓</span>
                      <span>{ponto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Riscos */}
            {analise?.riscos && analise.riscos.length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-100 p-5">
                <h3 className="font-semibold text-red-900 mb-3 text-sm">Riscos</h3>
                <ul className="space-y-2">
                  {analise.riscos.map((risco, i) => (
                    <li key={i} className="text-sm text-red-800 flex gap-2">
                      <span className="shrink-0">⚠</span>
                      <span>{risco}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Meta */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-xs text-gray-400 space-y-1">
              <p>Encontrado em: {new Date(imovel.created_at).toLocaleDateString('pt-BR')}</p>
              {analise && <p>Analisado em: {new Date(analise.created_at).toLocaleDateString('pt-BR')}</p>}
              <p>Fonte: {imovel.fonte.toUpperCase()}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
