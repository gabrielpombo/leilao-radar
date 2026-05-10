import * as cheerio from 'cheerio'
import type { ImovelRaw, TipoImovel } from '@/types'

const CIDADES_SP = [
  // Grande SP
  'SAO PAULO', 'GUARULHOS', 'OSASCO', 'SANTO ANDRE', 'SAO BERNARDO DO CAMPO',
  'MAUA', 'DIADEMA', 'CARAPICUIBA', 'MOGI DAS CRUZES', 'SUZANO', 'ITAQUAQUECETUBA',
  'BARUERI', 'COTIA', 'TABOAO DA SERRA', 'EMBU DAS ARTES', 'FRANCISCO MORATO',
  // Litoral
  'SANTOS', 'SAO VICENTE', 'PRAIA GRANDE', 'GUARUJA', 'CUBATAO', 'BERTIOGA',
  'CARAGUATATUBA', 'UBATUBA', 'SAO SEBASTIAO', 'ILHABELA',
  // Interior grande
  'CAMPINAS', 'SAO JOSE DOS CAMPOS', 'SOROCABA', 'RIBEIRAO PRETO',
  'SAO JOSE DO RIO PRETO', 'BAURU', 'PIRACICABA', 'JUNDIAI', 'LIMEIRA', 'TAUBATE',
  'AMERICANA', 'SAO CARLOS', 'ARAÇATUBA', 'PRESIDENTE PRUDENTE', 'MARILIA',
]

const TIPOS_MAP: Record<string, TipoImovel> = {
  'APARTAMENTO': 'residencial',
  'CASA': 'residencial',
  'CASA COMERCIAL': 'residencial',
  'GALPAO': 'galpao',
  'GALPÃO': 'galpao',
  'TERRENO': 'terreno',
  'LOTE': 'terreno',
  'AREA': 'terreno',
  'ÁREA': 'terreno',
}

function normalizarTipo(titulo: string): TipoImovel | undefined {
  const upper = titulo.toUpperCase()
  for (const [key, value] of Object.entries(TIPOS_MAP)) {
    if (upper.includes(key)) return value
  }
  return undefined
}

function parseMoeda(valor: string): number | undefined {
  if (!valor) return undefined
  const num = parseFloat(valor.replace(/[R$\s.]/g, '').replace(',', '.'))
  return isNaN(num) ? undefined : num
}

function parseArea(texto: string): number | undefined {
  const match = texto.match(/(\d+[.,]?\d*)\s*m²?/i)
  if (!match) return undefined
  return parseFloat(match[1].replace(',', '.'))
}

async function buscarPaginaCaixa(pagina: number): Promise<ImovelRaw[]> {
  const url = `https://venda.caixa.gov.br/imovels/busca-imovel.asp?` +
    `sltTipoImovel=&sltEstado=SP&sltCidade=&sltBairro=&` +
    `sltTipoLeilao=&sltOrder=&pagina=${pagina}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) throw new Error(`CEF retornou status ${response.status}`)

  const html = await response.text()
  const $ = cheerio.load(html)
  const imoveis: ImovelRaw[] = []

  // A CEF lista imóveis em tabela com classe "resultado"
  $('table.resultado tr, .resultados-imoveis .imovel-item, #resultado tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 3) return

    const linkEl = $(row).find('a[href*="imovel"]').first()
    const href = linkEl.attr('href')
    if (!href) return

    const url_original = href.startsWith('http')
      ? href
      : `https://venda.caixa.gov.br${href}`

    const titulo = linkEl.text().trim() || $(cells[0]).text().trim()
    const cidade = $(cells).filter((_, c) => {
      const t = $(c).text().toUpperCase()
      return CIDADES_SP.some(city => t.includes(city))
    }).first().text().trim()

    const textoCompleto = $(row).text()
    const valores = textoCompleto.match(/R\$\s*[\d.,]+/g) || []

    const imovel: ImovelRaw = {
      fonte: 'caixa',
      url_original,
      titulo,
      tipo: normalizarTipo(titulo),
      cidade: cidade || undefined,
      area_m2: parseArea(textoCompleto),
      valor_avaliacao: valores[0] ? parseMoeda(valores[0]) : undefined,
      valor_minimo: valores[1] ? parseMoeda(valores[1]) : undefined,
      raw_data: { html_row: $(row).html()?.substring(0, 2000) },
    }

    // Filtra só SP e tipos relevantes
    if (imovel.tipo && (cidade || textoCompleto.toUpperCase().includes('/SP'))) {
      imoveis.push(imovel)
    }
  })

  return imoveis
}

async function buscarDetalheCaixa(url: string): Promise<Partial<ImovelRaw>> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) return {}

  const html = await response.text()
  const $ = cheerio.load(html)

  const descricao = $('.descricao-imovel, .imovel-descricao, #descricao').text().trim()
  const imagens: string[] = []

  $('img[src*="imovel"], img[src*="fotos"], .galeria img').each((_, img) => {
    const src = $(img).attr('src')
    if (src) {
      imagens.push(src.startsWith('http') ? src : `https://venda.caixa.gov.br${src}`)
    }
  })

  // Tenta extrair cidade/bairro da página de detalhe
  const enderecoText = $('.endereco, .imovel-endereco, td:contains("Endereço")').next().text().trim()
    || $('td:contains("Município")').next().text().trim()

  const statusOcupacao = $('body').text().toLowerCase().includes('desocupado')
    ? 'desocupado'
    : $('body').text().toLowerCase().includes('ocupado')
    ? 'ocupado'
    : 'desconhecido'

  // Data do leilão
  const dataText = $('td:contains("Data"), .data-leilao').filter((_, el) => {
    return $(el).text().toLowerCase().includes('data')
  }).next().text().trim()

  let data_leilao: string | undefined
  const dataMatch = dataText.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (dataMatch) {
    const [dia, mes, ano] = dataMatch[1].split('/')
    data_leilao = new Date(`${ano}-${mes}-${dia}`).toISOString()
  }

  return {
    descricao: descricao || undefined,
    imagens: imagens.length > 0 ? imagens : undefined,
    status_ocupacao: statusOcupacao as 'ocupado' | 'desocupado' | 'desconhecido',
    data_leilao,
    cidade: enderecoText ? enderecoText.split(',')[0]?.trim() : undefined,
  }
}

export async function scraperCaixa(): Promise<ImovelRaw[]> {
  const todos: ImovelRaw[] = []
  let pagina = 1
  const maxPaginas = 20

  while (pagina <= maxPaginas) {
    try {
      const imoveis = await buscarPaginaCaixa(pagina)
      if (imoveis.length === 0) break

      // Busca detalhes de cada imóvel (em paralelo, lotes de 5)
      for (let i = 0; i < imoveis.length; i += 5) {
        const lote = imoveis.slice(i, i + 5)
        const detalhes = await Promise.allSettled(
          lote.map(im => buscarDetalheCaixa(im.url_original))
        )
        detalhes.forEach((resultado, idx) => {
          if (resultado.status === 'fulfilled') {
            Object.assign(lote[idx], resultado.value)
          }
        })
        // Pausa entre lotes para não sobrecarregar o servidor
        await new Promise(r => setTimeout(r, 1000))
      }

      todos.push(...imoveis)
      pagina++

      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`Erro na página ${pagina} da CEF:`, err)
      break
    }
  }

  return todos
}
