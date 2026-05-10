// Testa quais fontes de leilão são acessíveis a partir dos servidores do GitHub Actions
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
