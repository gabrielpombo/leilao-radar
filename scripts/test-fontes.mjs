// Testa quais fontes e analisa estrutura HTML das que funcionam
const ANALISAR = ['https://www.leilaobrasil.com.br', 'https://www.sodresantoro.com.br/imoveis']

for (const url of ANALISAR) {
  console.log(`\n=== ESTRUTURA: ${url} ===`)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    const html = await r.text()
    // Mostrar trecho com links de imóveis
    const matches = [...html.matchAll(/href="([^"]*imovel[^"]*|[^"]*lote[^"]*|[^"]*leilao[^"]*)"[^>]*>([^<]{5,60})</gi)]
    console.log(`Links encontrados (primeiros 15):`)
    matches.slice(0, 15).forEach(m => console.log(`  ${m[1]} → "${m[2].trim()}"`) )
    // Mostrar trecho com valores
    const valores = [...html.matchAll(/R\$\s*[\d.,]{4,}/g)].slice(0, 10)
    console.log(`Valores encontrados: ${valores.map(m => m[0]).join(' | ')}`)
    // Mostrar classes CSS com 'imovel' ou 'lote'
    const classes = [...new Set([...html.matchAll(/class="([^"]*(?:imovel|lote|item|card|listing)[^"]*)"/gi)].map(m => m[1]))]
    console.log(`Classes relevantes: ${classes.slice(0,8).join(', ')}`)
  } catch(e) { console.log(`Erro: ${e.message}`) }
}
console.log('\n=== TESTE DE ACESSIBILIDADE ===')
const fontes = [
  'https://venda.caixa.gov.br/imovels/busca-imovel.asp?sltEstado=SP',
  'https://www.caixa.gov.br/voce/habitacao/compra-imovel',
  'https://habitacao-app.caixa.gov.br/imoveis',
  'https://leiloes.caixa.gov.br/imoveis',
  'https://leiloes.bb.com.br/imoveis?estado=SP',
  'https://www.leilaobrasil.com.br',
  'https://megaleiloes.com.br/imoveis?estado=SP&tipo=imovel',
  'https://leilao.net/imoveis?estado=SP',
  'https://www.caixa.gov.br/Downloads/habitacao-documentos-varios/Imov%C3%A9is-dispon%C3%ADveis-para-venda.xlsx',
  'https://leiloeiro.com.br/peca.asp?lote=imovel&estado=SP',
  'https://www.sodresantoro.com.br/imoveis',
]

for (const url of fontes) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeilaoRadar/1.0)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })
    const text = await r.text()
    const kws = (text.match(/imovel|leil[aã]o|lance|avalia|arrema/gi) || []).length
    console.log(`[${r.status}] ${text.length}chars ${kws}kw — ${url}`)
  } catch (e) {
    console.log(`[ERRO: ${e.cause?.code || e.message.substring(0,30)}] — ${url}`)
  }
}
