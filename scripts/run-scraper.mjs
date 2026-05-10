/**
 * Scraper standalone — roda no GitHub Actions (servidores Azure, IPs variados)
 * Faz scraping da CEF e salva direto no Supabase.
 * Depois chama /api/analyze no Vercel para o Gemini analisar os novos imóveis.
 */

import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET  = process.env.CRON_SECRET
const APP_URL      = 'https://leilao-radar-mu.vercel.app'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Variáveis Supabase não definidas'); process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const CIDADES_SP = [
  'SAO PAULO','GUARULHOS','OSASCO','SANTO ANDRE','SAO BERNARDO DO CAMPO',
  'MAUA','DIADEMA','CARAPICUIBA','MOGI DAS CRUZES','SUZANO','ITAQUAQUECETUBA',
  'BARUERI','COTIA','CAMPINAS','SAO JOSE DOS CAMPOS','SOROCABA','RIBEIRAO PRETO',
  'SANTOS','SAO VICENTE','PRAIA GRANDE','GUARUJA','BERTIOGA','CARAGUATATUBA',
  'UBATUBA','SAO SEBASTIAO','ILHABELA','JUNDIAI','BAURU','PIRACICABA','TAUBATE',
  'SAO JOSE DO RIO PRETO','AMERICANA','SAO CARLOS','LIMEIRA',
]

const TIPOS_MAP = {
  'APARTAMENTO':'residencial','CASA':'residencial','CASA COMERCIAL':'residencial',
  'GALPAO':'galpao','GALPÃO':'galpao','TERRENO':'terreno','LOTE':'terreno',
  'AREA':'terreno','ÁREA':'terreno',
}

function normalizarTipo(titulo) {
  const up = titulo.toUpperCase()
  for (const [k, v] of Object.entries(TIPOS_MAP)) {
    if (up.includes(k)) return v
  }
  return null
}

function parseMoeda(s) {
  if (!s) return null
  const n = parseFloat(s.replace(/[R$\s.]/g,'').replace(',','.'))
  return isNaN(n) ? null : n
}

function parseArea(s) {
  const m = s.match(/(\d+[.,]?\d*)\s*m[²2]/i)
  return m ? parseFloat(m[1].replace(',','.')) : null
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  return r.text()
}

async function scraperCaixa() {
  const imoveis = []
  for (let pagina = 1; pagina <= 15; pagina++) {
    try {
      const url = `https://venda.caixa.gov.br/imovels/busca-imovel.asp?sltEstado=SP&pagina=${pagina}`
      const html = await fetchPage(url)
      const $ = cheerio.load(html)

      // Múltiplos seletores para cobrir variações de layout
      const linhas = $('table tr, .result-item, .imovel-card').toArray()
      if (linhas.length < 2) { console.log(`  Página ${pagina}: sem resultados, parando.`); break }

      let encontrados = 0
      for (const row of linhas) {
        const el = $(row)
        const link = el.find('a[href*="imovel"], a[href*="lote"]').first()
        const href = link.attr('href')
        if (!href) continue

        const url_original = href.startsWith('http') ? href : `https://venda.caixa.gov.br${href}`
        const titulo = link.text().trim() || el.find('h2, h3, .titulo').first().text().trim()
        const texto = el.text()
        const valores = texto.match(/R\$\s*[\d.,]+/g) || []
        const cidade = CIDADES_SP.find(c => texto.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().includes(c)) || null

        const tipo = normalizarTipo(titulo)
        if (!tipo) continue
        if (!cidade && !texto.toUpperCase().includes('/SP')) continue

        imoveis.push({
          fonte: 'caixa',
          url_original,
          titulo: titulo || null,
          tipo,
          cidade,
          area_m2: parseArea(texto),
          valor_avaliacao: valores[0] ? parseMoeda(valores[0]) : null,
          valor_minimo: valores[1] ? parseMoeda(valores[1]) : null,
          raw_data: { pagina, snippet: texto.substring(0, 500) },
        })
        encontrados++
      }

      console.log(`  Página ${pagina}: ${encontrados} imóveis`)
      if (encontrados === 0) break
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) {
      console.error(`  Página ${pagina} erro: ${e.message}`)
      break
    }
  }
  return imoveis
}

async function salvarNoSupabase(imoveis, fonte) {
  if (imoveis.length === 0) return 0
  let novos = 0
  for (let i = 0; i < imoveis.length; i += 20) {
    const lote = imoveis.slice(i, i + 20)
    const { data, error } = await sb.from('imoveis')
      .upsert(lote, { onConflict: 'url_original', ignoreDuplicates: true })
      .select('id')
    if (error) { console.error('Erro Supabase:', error.message); continue }
    novos += data?.length ?? 0
  }

  await sb.from('execucoes_log').insert({
    fonte, total_encontrados: imoveis.length, novos, analisados: 0, erros: 0,
  })
  return novos
}

async function triggrarAnalise() {
  if (!CRON_SECRET) return 0
  try {
    const r = await fetch(`${APP_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({ limite: 20 }),
      signal: AbortSignal.timeout(300000),
    })
    const d = await r.json()
    return d.analisados ?? 0
  } catch (e) {
    console.error('Erro ao chamar /api/analyze:', e.message)
    return 0
  }
}

async function main() {
  console.log(`\n=== Leilão Radar — Scraper (${new Date().toLocaleString('pt-BR')}) ===\n`)

  console.log('1. Scraping Caixa Econômica Federal...')
  const imoveis = await scraperCaixa()
  console.log(`   Total encontrado: ${imoveis.length} imóveis`)

  console.log('\n2. Salvando no Supabase...')
  const novos = await salvarNoSupabase(imoveis, 'caixa')
  console.log(`   Novos registros: ${novos}`)

  console.log('\n3. Acionando análise via Gemini...')
  const analisados = await triggrarAnalise()
  console.log(`   Imóveis analisados: ${analisados}`)

  console.log('\n=== Concluído ===')
}

main().catch(e => { console.error(e); process.exit(1) })
