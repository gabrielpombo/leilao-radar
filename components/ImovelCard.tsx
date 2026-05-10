import Link from 'next/link'
import type { ImovelComAnalise } from '@/types'

interface Props {
  imovel: ImovelComAnalise
}

function badgePontuacao(pontuacao: number | null) {
  if (!pontuacao) return { cor: 'bg-gray-100 text-gray-600', label: 'Sem análise' }
  if (pontuacao >= 7) return { cor: 'bg-green-100 text-green-800', label: `${pontuacao}/10 ✅` }
  if (pontuacao >= 5) return { cor: 'bg-yellow-100 text-yellow-800', label: `${pontuacao}/10 🟡` }
  return { cor: 'bg-red-100 text-red-800', label: `${pontuacao}/10 🔴` }
}

function formatarMoeda(valor: number | null) {
  if (!valor) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function ImovelCard({ imovel }: Props) {
  const analise = imovel.analises?.[0]
  const badge = badgePontuacao(analise?.pontuacao ?? null)

  const tipoLabel: Record<string, string> = {
    residencial: 'Residencial',
    galpao: 'Galpão',
    terreno: 'Terreno',
  }

  const desconto = imovel.valor_avaliacao && imovel.valor_minimo
    ? Math.round((1 - imovel.valor_minimo / imovel.valor_avaliacao) * 100)
    : null

  return (
    <Link href={`/imoveis/${imovel.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-1">
              {imovel.fonte.toUpperCase()} · {tipoLabel[imovel.tipo ?? ''] ?? imovel.tipo}
            </p>
            <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
              {imovel.titulo || `${tipoLabel[imovel.tipo ?? ''] ?? 'Imóvel'} em ${imovel.cidade}`}
            </h3>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cor}`}>
            {badge.label}
          </span>
        </div>

        {/* Localização */}
        <p className="text-sm text-gray-500 mb-3">
          📍 {imovel.cidade || '—'}{imovel.bairro ? ` / ${imovel.bairro}` : ''}
          {imovel.area_m2 ? ` · ${imovel.area_m2} m²` : ''}
        </p>

        {/* Valores */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs text-gray-400">Avaliação</p>
            <p className="text-sm font-medium text-gray-700">{formatarMoeda(imovel.valor_avaliacao)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Lance mínimo</p>
            <p className="text-sm font-bold text-gray-900">
              {formatarMoeda(imovel.valor_minimo)}
              {desconto !== null && desconto > 0 && (
                <span className="ml-1 text-green-600 font-normal">(-{desconto}%)</span>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100">
          <span>
            {imovel.data_leilao
              ? `Leilão: ${new Date(imovel.data_leilao).toLocaleDateString('pt-BR')}`
              : 'Data a confirmar'}
          </span>
          <span className={
            imovel.status_ocupacao === 'desocupado' ? 'text-green-600' :
            imovel.status_ocupacao === 'ocupado' ? 'text-red-500' : 'text-gray-400'
          }>
            {imovel.status_ocupacao === 'desocupado' ? '✅ Desocupado' :
             imovel.status_ocupacao === 'ocupado' ? '⚠️ Ocupado' : '❓ Ocupação desconhecida'}
          </span>
        </div>
      </div>
    </Link>
  )
}
