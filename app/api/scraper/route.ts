import { NextRequest, NextResponse } from 'next/server'
import { executarScraper } from '@/lib/scrapers'

export const preferredRegion = 'gru1'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const fonte = body.fonte ?? 'todos'

  const resultado = await executarScraper(fonte)
  return NextResponse.json({ ok: true, resultado })
}
