/**
 * Scraper standalone — roda no GitHub Actions (servidores Azure, IPs variados)
 * Faz scraping do LeilaoBrasil.com.br e salva direto no Supabase.
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

const TIPOS_MAP = {
  'APARTAMENTO': 'residencial', 'APTO': 'residencial',
  'CASA': 'residencial', 'SOBRADO': 'residencial',
  'KITNET': 'residencial', 'STUDIO': 'residencial',
  'FLAT': 'residencial', 'COBERTURA': 'residencial',
  'RESIDENCIAL': 'residencial',
  'GALPAO': 'galpao', 'GALPÃO': 'galpao',
  'ARMAZEM': 'galpao', 'ARMAZÉM': 'galpao',
  'DEPOSITO': 'galpao', 'DEPÓSITO': 'galpao',
  'BARRACAO': 'galpao', 'BARRACÃO': 'galpao',
  'TERRENO': 'terreno', 'LOTE': 'terreno',
  'AREA': 'terreno', 'ÁREA': 'terreno', 'GLEBA': 'terreno',
}

function normalizarTipo(titulo) {
  const up = titulo.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [k, v] of Object.entries(TIPOS_MAP)) {
    const kn = k.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (up.includes(kn)) return v
  }
  return null
}

function parseMoeda(s) {
  if (!s) return null
  const n = parseFloat(s.replace(/[R$\s.]/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseArea(s) {
  const m = s.match(/(\d+[.,]?\d*)\s*m[²2]/i)
  return m ? parseFloat(m[1].replace(',', '.')) : null
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  return r.text()
}

function extrairCidade(texto) {
  // "SP - São Paulo" ou "SP – Guarulhos"
  const m = texto.match(/\bSP\s*[-–]\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{1,40})/u)
  if (!m) return null
  return m[1].trim().replace(/\s+/g, ' ')
}

function extrairData(texto) {
  // "Abertura: 22/05/2026 10:33" ou "Fechamento: ..."
  const m = texto.match(/Aber(?:tura)?[:\s]+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/i)
  if (!m) return null
  const [, d, mo, y, t] = m
  return new Date(`${y}-${mo}-${d}T${t}:00-03:00`).toISOString()
}

async function scraperLeilaoBrasil() {
  const imoveis = []
  const seen = new Set()

  console.log('  Buscando página principal...')
  const html = await fetchPage('https://www.leilaobrasil.com.br')
  const $ = cheerio.load(html)

  // Positional match: Nth img.img-evento corresponds to Nth .cont-infos
  const imgs      = $('img.img-evento[alt]').toArray()
  const contInfos = $('.cont-infos').toArray()
  console.log(`  img.img-evento: ${imgs.length} | .cont-infos: ${contInfos.length}`)

  // Debug first pair
  if (imgs.length && contInfos.length) {
    const ci0text = $(contInfos[0]).text().replace(/\s+/g, ' ').substring(0, 250)
    console.log(`  --- Debug 1º item ---`)
    console.log(`  alt: ${$(imgs[0]).attr('alt')}`)
    console.log(`  href: ${$(imgs[0]).parent('a').attr('href')}`)
    console.log(`  cont-infos[0] (250 chars): ${ci0text}`)
    console.log(`  ---`)
  }

  const count = Math.min(imgs.length, contInfos.length)
  for (let i = 0; i < count; i++) {
    const img = $(imgs[i])
    const ci  = $(contInfos[i])

    const titulo = img.attr('alt')?.replace(/\s+/g, ' ').trim() || ''
    if (!titulo || titulo.length < 5) continue

    const href = img.parent('a').attr('href') || ''
    if (!href.includes('/eventos/leilao/')) continue

    const url_original = href.startsWith('http')
      ? href
      : `https://www.leilaobrasil.com.br${href}`

    if (seen.has(url_original)) continue
    seen.add(url_original)

    const texto = ci.text().replace(/\s+/g, ' ')

    // Apenas SP
    if (!texto.includes('SP -') && !texto.includes('SP –')) continue

    // Tipo
    const tipo = normalizarTipo(titulo)
    if (!tipo) continue

    // Cidade
    const cidade = extrairCidade(texto)

    // Valores
    const valoresMatch = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
    const valor_minimo    = valoresMatch[0] ? parseMoeda('R$ ' + valoresMatch[0][1]) : null
    const valor_avaliacao = valoresMatch[1] ? parseMoeda('R$ ' + valoresMatch[1][1]) : null

    // Data do leilão
    const data_leilao = extrairData(texto)

    // Desconto
    const discMatch = texto.match(/(\d+)%\s*desconto/i)
    const desconto = discMatch ? parseInt(discMatch[1]) : null

    // Status de ocupação
    let status_ocupacao = 'desconhecido'
    if (/desocupado|livre|vago/i.test(texto))  status_ocupacao = 'desocupado'
    else if (/ocupado/i.test(texto))            status_ocupacao = 'ocupado'

    imoveis.push({
      fonte: 'leilaobrasil',
      url_original,
      titulo,
      tipo,
      cidade,
      area_m2: parseArea(titulo),
      valor_avaliacao,
      valor_minimo,
      data_leilao,
      status_ocupacao,
      raw_data: {
        desconto,
        snippet: texto.substring(0, 600),
      },
    })
  }

  console.log(`  Total SP encontrado: ${imoveis.length} imóveis`)
  // Log amostra
  imoveis.slice(0, 3).forEach(im =>
    console.log(`    [${im.tipo}] ${im.titulo.substring(0,60)} | ${im.cidade} | R$ ${im.valor_minimo?.toLocaleString('pt-BR') ?? '?'}`)
  )
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
  if (!CRON_SECRET) { console.log('  CRON_SECRET ausente, pulando análise'); return 0 }
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

  console.log('1. Scraping LeilaoBrasil.com.br (SP)...')
  const imoveis = await scraperLeilaoBrasil()
  console.log(`   Total encontrado: ${imoveis.length} imóveis`)

  console.log('\n2. Salvando no Supabase...')
  const novos = await salvarNoSupabase(imoveis, 'leilaobrasil')
  console.log(`   Novos registros: ${novos}`)

  console.log('\n3. Acionando análise via Gemini...')
  const analisados = await triggrarAnalise()
  console.log(`   Imóveis analisados: ${analisados}`)

  console.log('\n=== Concluído ===')
}

main().catch(e => { console.error(e); process.exit(1) })
