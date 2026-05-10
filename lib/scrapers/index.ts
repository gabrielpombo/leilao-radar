import { scraperCaixa } from './caixa'
import { supabaseAdmin } from '@/lib/supabase'
import type { ImovelRaw, ExecucaoLog } from '@/types'

export async function executarScraper(fonte: 'caixa' | 'todos' = 'todos') {
  const resultados: Partial<ExecucaoLog>[] = []

  const scrapers: Array<{ nome: 'caixa'; fn: () => Promise<ImovelRaw[]> }> = []

  if (fonte === 'caixa' || fonte === 'todos') {
    scrapers.push({ nome: 'caixa', fn: scraperCaixa })
  }

  for (const scraper of scrapers) {
    let total = 0
    let novos = 0
    let erros = 0

    try {
      console.log(`Iniciando scraper: ${scraper.nome}`)
      const imoveis = await scraper.fn()
      total = imoveis.length

      // Salva em lotes de 20 no Supabase
      for (let i = 0; i < imoveis.length; i += 20) {
        const lote = imoveis.slice(i, i + 20)
        const { data, error } = await supabaseAdmin
          .from('imoveis')
          .upsert(lote, {
            onConflict: 'url_original',
            ignoreDuplicates: true,
          })
          .select('id')

        if (error) {
          console.error(`Erro ao salvar lote ${i}:`, error)
          erros += lote.length
        } else {
          novos += data?.length ?? 0
        }
      }
    } catch (err) {
      console.error(`Erro no scraper ${scraper.nome}:`, err)
      erros++
    }

    // Loga a execução
    const log = {
      fonte: scraper.nome,
      total_encontrados: total,
      novos,
      analisados: 0,
      erros,
    }

    await supabaseAdmin.from('execucoes_log').insert(log)
    resultados.push(log)
    console.log(`Scraper ${scraper.nome} concluído:`, log)
  }

  return resultados
}
