import { NextRequest, NextResponse } from 'next/server'
import { executarScraper } from '@/lib/scrapers'
import { analisarPendentes } from '@/lib/claude'
import { notificarOportunidades } from '@/lib/telegram'

// Força execução no servidor de São Paulo — necessário para acessar sites gov.br
export const preferredRegion = 'gru1'
export const maxDuration = 300
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const inicio = Date.now()
  const resultado: Record<string, unknown> = {}

  try {
    // 1. Scraping
    console.log('[CRON] Iniciando scraping...')
    const scraperResult = await executarScraper('caixa')
    resultado.scraping = scraperResult

    // 2. Análise com Claude (até 15 imóveis por vez para não exceder timeout do Vercel)
    console.log('[CRON] Analisando imóveis pendentes...')
    const analisados = await analisarPendentes(15)
    resultado.analisados = analisados

    // 3. Notificações Telegram
    console.log('[CRON] Enviando notificações...')
    const notificados = await notificarOportunidades(7)
    resultado.notificados = notificados

    resultado.duracao_ms = Date.now() - inicio
    resultado.executado_em = new Date().toISOString()

    console.log('[CRON] Concluído:', resultado)
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[CRON] Erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// Vercel Cron faz GET, então suportamos os dois
export async function GET(request: NextRequest) {
  return POST(request)
}
