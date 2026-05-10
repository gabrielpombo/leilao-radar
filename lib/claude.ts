import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/lib/supabase'
import type { Imovel, Recomendacao } from '@/types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

interface ResultadoAnalise {
  analise_completa: string
  pontuacao: number
  valor_mercado_estimado: number | null
  desconto_percentual: number | null
  riscos: string[]
  pontos_positivos: string[]
  recomendacao: Recomendacao
}

function formatarMoeda(valor: number | null): string {
  if (!valor) return 'Não informado'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function buildPrompt(imovel: Imovel): string {
  const desconto = imovel.valor_avaliacao && imovel.valor_minimo
    ? Math.round((1 - imovel.valor_minimo / imovel.valor_avaliacao) * 100)
    : null

  return `Você é um especialista em avaliação de imóveis em leilão no Brasil, com foco no estado de São Paulo.

Analise o seguinte imóvel em leilão e forneça uma análise completa para um investidor:

## Dados do Imóvel
- **Título**: ${imovel.titulo || 'Não informado'}
- **Tipo**: ${imovel.tipo || 'Não informado'}
- **Cidade/Bairro**: ${imovel.cidade || 'Não informado'}${imovel.bairro ? ` / ${imovel.bairro}` : ''}
- **Área**: ${imovel.area_m2 ? `${imovel.area_m2} m²` : 'Não informada'}
- **Valor de Avaliação**: ${formatarMoeda(imovel.valor_avaliacao)}
- **Lance Mínimo**: ${formatarMoeda(imovel.valor_minimo)}
- **Desconto sobre avaliação**: ${desconto !== null ? `${desconto}%` : 'Não calculável'}
- **Data do Leilão**: ${imovel.data_leilao ? new Date(imovel.data_leilao).toLocaleDateString('pt-BR') : 'Não informada'}
- **Situação de Ocupação**: ${imovel.status_ocupacao}
- **Fonte**: ${imovel.fonte.toUpperCase()}
- **Descrição**: ${imovel.descricao || 'Não disponível'}

## Sua Análise deve conter (em JSON):

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "analise_completa": "Texto corrido com análise detalhada em 4-6 parágrafos. Cubra: potencial do imóvel, contexto regional, comparação de valor com mercado, riscos práticos, recomendação final.",
  "pontuacao": <número de 1 a 10>,
  "valor_mercado_estimado": <número em reais ou null se não for possível estimar>,
  "desconto_percentual": <percentual real de desconto vs mercado ou null>,
  "riscos": ["risco 1", "risco 2", "risco 3"],
  "pontos_positivos": ["ponto 1", "ponto 2", "ponto 3"],
  "recomendacao": "oportunidade" | "analisar_mais" | "evitar"
}

Critérios de pontuação:
- 8-10: Excelente oportunidade, desconto real significativo, baixo risco
- 6-7: Vale investigar mais, potencial mas com ressalvas
- 4-5: Risco moderado, pouco desconto real
- 1-3: Evitar, problemas sérios ou valor não justifica

Para recomendação:
- "oportunidade": pontuação ≥ 7
- "analisar_mais": pontuação 5-6
- "evitar": pontuação ≤ 4`
}

export async function analisarImovel(imovel: Imovel): Promise<ResultadoAnalise | null> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(buildPrompt(imovel))
    const texto = result.response.text()

    const jsonMatch = texto.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta')

    const resultado: ResultadoAnalise = JSON.parse(jsonMatch[0])
    return resultado
  } catch (err) {
    console.error(`Erro ao analisar imóvel ${imovel.id}:`, err)
    return null
  }
}

export async function analisarPendentes(limite = 10): Promise<number> {
  const { data: imoveis, error } = await supabaseAdmin
    .from('imoveis')
    .select('*')
    .eq('analisado', false)
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error || !imoveis || imoveis.length === 0) return 0

  let analisados = 0

  for (const imovel of imoveis) {
    const resultado = await analisarImovel(imovel as Imovel)

    if (resultado) {
      const { error: errAnalise } = await supabaseAdmin
        .from('analises')
        .insert({
          imovel_id: imovel.id,
          ...resultado,
        })

      if (!errAnalise) {
        await supabaseAdmin
          .from('imoveis')
          .update({ analisado: true })
          .eq('id', imovel.id)
        analisados++
      }
    }

    // Pausa para não exceder rate limits
    await new Promise(r => setTimeout(r, 500))
  }

  return analisados
}
