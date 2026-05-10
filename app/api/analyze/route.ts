import { NextRequest, NextResponse } from 'next/server'
import { analisarPendentes } from '@/lib/claude'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const limite = body.limite ?? 10

  const analisados = await analisarPendentes(limite)
  return NextResponse.json({ ok: true, analisados })
}
