/**
 * Scraper standalone — roda no GitHub Actions (15 min de timeout, IPs variados)
 * 1. Faz scraping do LeilaoBrasil.com.br para SP
 * 2. Salva novos imóveis no Supabase
 * 3. Analisa pendentes direto com Gemini (sem precisar da rota Vercel)
 */

import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY   = process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Variáveis Supabase não definidas'); process.exit(1)
}

const sb    = createClient(SUPABASE_URL, SUPABASE_KEY)
const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
    if (up.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return v
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

function extrairCidade(texto) {
  const m = texto.match(/\bSP\s*[-–]\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{1,40})/u)
  if (!m) return null
  return m[1].trim().replace(/\s+/g, ' ')
}

function extrairData(texto) {
  const m = texto.match(/Aber(?:tura)?[:\s]+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/i)
  if (!m) return null
  const [, d, mo, y, t] = m
  return new Date(`${y}-${mo}-${d}T${t}:00-03:00`).toISOString()
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

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

async function scraperLeilaoBrasil() {
  const imoveis = []
  const seen = new Set()

  console.log('  Buscando página principal...')
  const html = await fetchPage('https://www.leilaobrasil.com.br')
  const $ = cheerio.load(html)

  // Nth img.img-evento ↔ Nth .cont-infos (positional match)
  const imgs      = $('img.img-evento[alt]').toArray()
  const contInfos = $('.cont-infos').toArray()
  console.log(`  img.img-evento: ${imgs.length} | .cont-infos: ${contInfos.length}`)

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

    if (!texto.includes('SP -') && !texto.includes('SP –')) continue

    const tipo = normalizarTipo(titulo)
    if (!tipo) continue

    const cidade = extrairCidade(texto)
    const valoresMatch = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)]

    let status_ocupacao = 'desconhecido'
    if (/desocupado|livre|vago/i.test(texto))  status_ocupacao = 'desocupado'
    else if (/ocupado/i.test(texto))            status_ocupacao = 'ocupado'

    const discMatch = texto.match(/(\d+)%\s*desconto/i)

    imoveis.push({
      fonte: 'leilaobrasil',
      url_original,
      titulo,
      tipo,
      cidade,
      area_m2: parseArea(titulo),
      valor_avaliacao: valoresMatch[1] ? parseMoeda('R$ ' + valoresMatch[1][1]) : null,
      valor_minimo:    valoresMatch[0] ? parseMoeda('R$ ' + valoresMatch[0][1]) : null,
      data_leilao: extrairData(texto),
      status_ocupacao,
      raw_data: {
        desconto: discMatch ? parseInt(discMatch[1]) : null,
        snippet: texto.substring(0, 600),
      },
    })
  }

  console.log(`  SP encontrado: ${imoveis.length} imóveis`)
  imoveis.slice(0, 3).forEach(im =>
    console.log(`    [${im.tipo}] ${im.titulo.substring(0, 55)} | ${im.cidade} | R$ ${im.valor_minimo?.toLocaleString('pt-BR') ?? '?'}`)
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

// ─── Análise Gemini ───────────────────────────────────────────────────────────

function buildPrompt(imovel) {
  const desconto = imovel.valor_avaliacao && imovel.valor_minimo
    ? Math.round((1 - imovel.valor_minimo / imovel.valor_avaliacao) * 100)
    : null
  const moeda = v => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Não informado'

  return `Você é um especialista em avaliação de imóveis em leilão no Brasil, com foco em São Paulo.

Analise o imóvel abaixo e retorne APENAS um JSON válido:

## Dados
- Título: ${imovel.titulo || 'N/A'}
- Tipo: ${imovel.tipo}
- Cidade: ${imovel.cidade || 'N/A'}
- Área: ${imovel.area_m2 ? imovel.area_m2 + ' m²' : 'N/A'}
- Valor avaliação: ${moeda(imovel.valor_avaliacao)}
- Lance mínimo: ${moeda(imovel.valor_minimo)}
- Desconto s/ avaliação: ${desconto !== null ? desconto + '%' : 'N/A'}
- Data leilão: ${imovel.data_leilao ? new Date(imovel.data_leilao).toLocaleDateString('pt-BR') : 'N/A'}
- Ocupação: ${imovel.status_ocupacao}
- Fonte: ${imovel.fonte}

## JSON esperado:
{
  "analise_completa": "3-5 parágrafos: potencial, contexto regional, comparação de mercado, riscos, recomendação",
  "pontuacao": <1-10>,
  "valor_mercado_estimado": <número ou null>,
  "desconto_percentual": <% real vs mercado ou null>,
  "riscos": ["risco 1", "risco 2"],
  "pontos_positivos": ["ponto 1", "ponto 2"],
  "recomendacao": "oportunidade" | "analisar_mais" | "evitar"
}

Pontuação: 8-10=oportunidade clara, 6-7=investigar, 4-5=risco moderado, 1-3=evitar.`
}

async function analisarImovel(imovel) {
  if (!genAI) return null
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(buildPrompt(imovel))
    const texto = result.response.text()
    const jsonMatch = texto.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta')
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error(`    Erro Gemini (${imovel.id?.substring(0, 8)}): ${e.message}`)
    return null
  }
}

async function analisarNovos(limite = 20) {
  if (!genAI) {
    console.log('  GEMINI_API_KEY não configurada — pulando análise')
    return 0
  }

  const { data: imoveis, error } = await sb.from('imoveis')
    .select('*')
    .eq('analisado', false)
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) { console.error('  Erro ao buscar pendentes:', error.message); return 0 }
  if (!imoveis?.length) { console.log('  Nenhum imóvel pendente de análise'); return 0 }

  console.log(`  ${imoveis.length} imóveis para analisar`)
  let analisados = 0

  for (const imovel of imoveis) {
    const resultado = await analisarImovel(imovel)
    if (!resultado) continue

    const { error: errA } = await sb.from('analises').insert({
      imovel_id: imovel.id,
      analise_completa:      resultado.analise_completa,
      pontuacao:             resultado.pontuacao,
      valor_mercado_estimado: resultado.valor_mercado_estimado,
      desconto_percentual:   resultado.desconto_percentual,
      riscos:                resultado.riscos,
      pontos_positivos:      resultado.pontos_positivos,
      recomendacao:          resultado.recomendacao,
    })

    if (!errA) {
      await sb.from('imoveis').update({ analisado: true }).eq('id', imovel.id)
      analisados++
      console.log(`    ✓ [${resultado.pontuacao}/10] ${imovel.titulo?.substring(0, 55)} — ${resultado.recomendacao}`)
    } else {
      console.error(`    Erro ao salvar análise: ${errA.message}`)
    }

    await new Promise(r => setTimeout(r, 600))
  }

  return analisados
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Leilão Radar — Scraper (${new Date().toLocaleString('pt-BR')}) ===\n`)

  console.log('1. Scraping LeilaoBrasil.com.br (SP)...')
  const imoveis = await scraperLeilaoBrasil()
  console.log(`   Total encontrado: ${imoveis.length} imóveis`)

  console.log('\n2. Salvando no Supabase...')
  const novos = await salvarNoSupabase(imoveis, 'leilaobrasil')
  console.log(`   Novos registros: ${novos}`)

  console.log('\n3. Analisando com Gemini (direto, sem Vercel)...')
  const analisados = await analisarNovos(30)
  console.log(`   Imóveis analisados: ${analisados}`)

  console.log('\n=== Concluído ===')
}

main().catch(e => { console.error(e); process.exit(1) })
