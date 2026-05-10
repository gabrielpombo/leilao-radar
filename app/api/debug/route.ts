import { NextRequest, NextResponse } from 'next/server'

export const preferredRegion = 'gru1'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = request.nextUrl.searchParams.get('url') || 'https://venda.caixa.gov.br/imovels/busca-imovel.asp?sltEstado=SP&pagina=1'

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    })

    const html = await res.text()
    return NextResponse.json({
      status: res.status,
      url,
      length: html.length,
      preview: html.substring(0, 8000),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
