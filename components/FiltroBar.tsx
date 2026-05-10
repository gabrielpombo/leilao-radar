'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const CIDADES = [
  'São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo',
  'Campinas', 'Santos', 'São Vicente', 'Praia Grande', 'Guarujá',
  'São José dos Campos', 'Sorocaba', 'Ribeirão Preto', 'Jundiaí', 'Bauru',
]

export function FiltroBar() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const atualizar = useCallback((chave: string, valor: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) {
      params.set(chave, valor)
    } else {
      params.delete(chave)
    }
    router.push(`/?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
      <select
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={searchParams.get('tipo') ?? ''}
        onChange={e => atualizar('tipo', e.target.value)}
      >
        <option value="">Todos os tipos</option>
        <option value="residencial">Residencial</option>
        <option value="galpao">Galpão</option>
        <option value="terreno">Terreno</option>
      </select>

      <select
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={searchParams.get('cidade') ?? ''}
        onChange={e => atualizar('cidade', e.target.value)}
      >
        <option value="">Todas as cidades</option>
        {CIDADES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={searchParams.get('recomendacao') ?? ''}
        onChange={e => atualizar('recomendacao', e.target.value)}
      >
        <option value="">Todas as recomendações</option>
        <option value="oportunidade">✅ Oportunidade</option>
        <option value="analisar_mais">🟡 Analisar Mais</option>
        <option value="evitar">🔴 Evitar</option>
      </select>

      <select
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={searchParams.get('ordem') ?? 'pontuacao'}
        onChange={e => atualizar('ordem', e.target.value)}
      >
        <option value="pontuacao">Ordenar: Pontuação</option>
        <option value="data_leilao">Ordenar: Data do Leilão</option>
        <option value="valor_minimo">Ordenar: Menor valor</option>
        <option value="created_at">Ordenar: Mais recentes</option>
      </select>

      {(searchParams.get('tipo') || searchParams.get('cidade') || searchParams.get('recomendacao')) && (
        <button
          className="text-sm text-gray-500 hover:text-red-500 px-3 py-2"
          onClick={() => router.push('/')}
        >
          Limpar filtros ×
        </button>
      )}
    </div>
  )
}
