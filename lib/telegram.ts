import { supabaseAdmin } from '@/lib/supabase'
import type { Imovel, Analise } from '@/types'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

function formatarMoeda(valor: number | null): string {
  if (!valor) return 'N/A'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function tipoEmoji(tipo: string | null): string {
  if (tipo === 'galpao') return '🏭'
  if (tipo === 'terreno') return '🌿'
  return '🏠'
}

function recomendacaoTexto(rec: string | null): string {
  if (rec === 'oportunidade') return '✅ OPORTUNIDADE'
  if (rec === 'analisar_mais') return '🟡 Analisar Mais'
  return '🔴 Evitar'
}

export async function enviarAlertaTelegram(imovel: Imovel, analise: Analise): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.warn('Telegram não configurado')
    return false
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://leilao-radar.vercel.app'
  const emoji = tipoEmoji(imovel.tipo)
  const tipoLabel = imovel.tipo === 'galpao' ? 'Galpão' : imovel.tipo === 'terreno' ? 'Terreno' : 'Imóvel'

  const mensagem = `${emoji} *${recomendacaoTexto(analise.recomendacao)}*
Pontuação: *${analise.pontuacao}/10*

📍 ${tipoLabel}${imovel.area_m2 ? ` ${imovel.area_m2}m²` : ''} — ${imovel.cidade || 'SP'}${imovel.bairro ? ` / ${imovel.bairro}` : ''}
🏦 ${imovel.fonte.toUpperCase() === 'CAIXA' ? 'Caixa Econômica Federal' : imovel.fonte.toUpperCase()}
💰 Avaliado: ${formatarMoeda(imovel.valor_avaliacao)} | Lance mín: *${formatarMoeda(imovel.valor_minimo)}*${analise.desconto_percentual ? ` (${Math.round(analise.desconto_percentual)}% off)` : ''}
📅 Leilão: ${imovel.data_leilao ? new Date(imovel.data_leilao).toLocaleDateString('pt-BR') : 'A confirmar'}
${imovel.status_ocupacao === 'desocupado' ? '✅ Desocupado' : imovel.status_ocupacao === 'ocupado' ? '⚠️ Ocupado' : '❓ Ocupação desconhecida'}

[Ver análise completa](${baseUrl}/imoveis/${imovel.id})`

  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensagem,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    })

    if (!response.ok) {
      const erro = await response.json()
      console.error('Erro Telegram:', erro)
      return false
    }

    return true
  } catch (err) {
    console.error('Falha ao enviar Telegram:', err)
    return false
  }
}

export async function notificarOportunidades(pontuacaoMinima = 7): Promise<number> {
  // Busca análises com boa pontuação que ainda não foram notificadas
  const { data, error } = await supabaseAdmin
    .from('analises')
    .select('*, imoveis(*)')
    .eq('notificado', false)
    .gte('pontuacao', pontuacaoMinima)
    .order('pontuacao', { ascending: false })

  if (error || !data || data.length === 0) return 0

  let notificados = 0

  for (const row of data) {
    const analise = row as Analise & { imoveis: Imovel }
    const imovel = analise.imoveis

    if (!imovel) continue

    const ok = await enviarAlertaTelegram(imovel, analise)

    if (ok) {
      await supabaseAdmin
        .from('analises')
        .update({ notificado: true })
        .eq('id', analise.id)
      notificados++
    }

    await new Promise(r => setTimeout(r, 200))
  }

  return notificados
}
