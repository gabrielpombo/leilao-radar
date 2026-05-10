// Testa acessibilidade das fontes e analisa estrutura HTML do LeilaoBrasil
const PRINCIPAL = 'https://www.leilaobrasil.com.br'

console.log(`\n=== ANÁLISE DE ESTRUTURA: ${PRINCIPAL} ===`)
try {
  const r = await fetch(PRINCIPAL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(20000),
  })
  const html = await r.text()
  console.log(`Status: ${r.status} | Tamanho: ${(html.length/1024).toFixed(0)}KB`)

  // Contagem de classes relevantes
  const classes = ['item-leilao', 'h-card', 'f-card', 'flex-cards', 'item-desconto']
  for (const cls of classes) {
    const count = (html.match(new RegExp(`class="[^"]*${cls}[^"]*"`, 'g')) || []).length
    console.log(`  .${cls}: ${count} ocorrências`)
  }

  // Mostrar HTML bruto do primeiro card encontrado para debug
  const cardPatterns = ['item-leilao', 'h-card', 'f-card']
  for (const cls of cardPatterns) {
    const idx = html.indexOf(`class="${cls}`)
    if (idx === -1) continue
    // Pegar ~800 chars do ponto onde o card começa (retroceder para a <div>)
    const start = html.lastIndexOf('<div', idx)
    console.log(`\n--- Amostra HTML do primeiro .${cls} (800 chars) ---`)
    console.log(html.substring(start, start + 800))
    break
  }

  // Links de imóveis encontrados
  const linksImovel = [...html.matchAll(/href="(\/eventos\/leilao\/[^"]+)"/g)]
  console.log(`\nLinks /eventos/leilao/ encontrados: ${linksImovel.length}`)
  linksImovel.slice(0, 5).forEach(m => console.log(`  ${m[1]}`))

  // Valores R$
  const valores = [...html.matchAll(/R\$\s*[\d.,]{4,}/g)].slice(0, 8)
  console.log(`\nValores R$ (primeiros 8): ${valores.map(m => m[0]).join(' | ')}`)

  // Cidades SP
  const cidadesSP = [...html.matchAll(/SP\s*[-–]\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s]{2,25})/gu)]
  const uniqueCidades = [...new Set(cidadesSP.map(m => m[1].trim()))].slice(0, 10)
  console.log(`\nCidades SP encontradas: ${uniqueCidades.join(', ')}`)

} catch(e) {
  console.log(`Erro: ${e.message}`)
}

console.log('\n=== TESTE RÁPIDO DE OUTRAS FONTES ===')
const fontes = [
  'https://megaleiloes.com.br',
  'https://www.sodresantoro.com.br/imoveis',
  'https://leilao.net',
]
for (const url of fontes) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })
    const text = await r.text()
    const kws = (text.match(/imovel|leil[aã]o|lance|avalia|arrema/gi) || []).length
    console.log(`[${r.status}] ${(text.length/1024).toFixed(0)}KB ${kws}kw — ${url}`)
  } catch (e) {
    console.log(`[ERRO: ${e.cause?.code || e.message.substring(0,40)}] — ${url}`)
  }
}
