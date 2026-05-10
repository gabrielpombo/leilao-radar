import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'
import https from 'https'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const TEAM_ID     = process.env.VERCEL_ORG_ID || 'team_RsRd1rZ22SMufUdbL1ujZ6S3'
const PROJECT_ID  = process.env.VERCEL_PROJECT_ID || 'prj_pFUEAHr2RK9kR7c88O7MBmj4DEG8'
const ROOT = process.env.PROJECT_ROOT || process.cwd()

const SKIP = new Set(['node_modules', '.next', '.vercel', '.git', 'deploy-vercel.mjs', 'tsconfig.tsbuildinfo'])

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) results.push(...walk(full))
    else results.push({ full, rel: relative(ROOT, full).replace(/\\/g, '/') })
  }
  return results
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex')
}

function httpsRequest(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.vercel.com',
      path,
      method,
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, ...headers },
    }
    const req = https.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks)
        let data
        try { data = JSON.parse(raw.toString()) } catch { data = raw }
        resolve({ status: res.statusCode, data })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function createDeployment(files) {
  const body = Buffer.from(JSON.stringify({
    name: 'leilao-radar',
    project: PROJECT_ID,
    target: 'production',
    files,
    projectSettings: { framework: 'nextjs' },
  }))

  const res = await httpsRequest(
    'POST',
    `/v13/deployments?teamId=${TEAM_ID}`,
    { 'Content-Type': 'application/json', 'Content-Length': body.length },
    body
  )
  return res
}

async function uploadFile(bytes, digestSha) {
  const res = await httpsRequest(
    'POST',
    `/v2/files?teamId=${TEAM_ID}`,
    {
      'Content-Type': 'application/octet-stream',
      'Content-Length': bytes.length,
      'x-vercel-checksum': digestSha,
    },
    bytes
  )
  return res
}

async function pollDeployment(deployId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await httpsRequest('GET', `/v13/deployments/${deployId}?teamId=${TEAM_ID}`, {}, null)
    const state = res.data?.readyState || res.data?.status
    process.stdout.write(`\r  Status: ${state}          `)
    if (['READY', 'ERROR', 'CANCELED'].includes(state)) {
      console.log()
      return res.data
    }
  }
  console.log()
  return null
}

async function main() {
  const allFiles = walk(ROOT)
  console.log(`Arquivos encontrados: ${allFiles.length}`)

  // Mapa sha → bytes
  const shaMap = new Map()
  const fileList = []

  for (const { full, rel } of allFiles) {
    const bytes = readFileSync(full)
    const digest = sha1(bytes)
    shaMap.set(digest, { bytes, rel })
    fileList.push({ file: rel, sha: digest, size: bytes.length })
  }

  // Passo 1: Criar deployment com metadados
  console.log('\nCriando deployment (enviando metadados)...')
  const deployRes = await createDeployment(fileList)

  if (deployRes.status === 200 || deployRes.status === 201) {
    // Deploy criado direto (todos os arquivos em cache)
    const d = deployRes.data
    console.log(`\nDeployment criado! ID: ${d.id}`)
    console.log(`URL: https://${d.url}`)
    console.log('Aguardando build...')
    const final = await pollDeployment(d.id)
    if (final?.readyState === 'READY') {
      console.log(`\nApp no ar: https://${final.url}`)
    } else {
      console.log(`Estado final: ${final?.readyState}`)
    }
    return
  }

  if (deployRes.status === 400 && deployRes.data?.error?.code === 'missing_files') {
    const missingShas = new Set(deployRes.data.error.missing)
    console.log(`Vercel precisa de ${missingShas.size} arquivos. Fazendo upload...`)

    for (const [digest, { bytes, rel }] of shaMap) {
      if (!missingShas.has(digest)) continue
      const upRes = await uploadFile(bytes, digest)
      if (upRes.status === 200 || upRes.status === 201 || upRes.status === 204) {
        console.log(`  ✓ ${rel}`)
      } else if (upRes.status === 409) {
        console.log(`  ○ ${rel} (já existe)`)
      } else {
        console.error(`  ✗ ${rel} — ${upRes.status}: ${JSON.stringify(upRes.data)}`)
      }
    }

    // Passo 3: Recriar deployment após uploads
    console.log('\nFinalizando deployment...')
    const deployRes2 = await createDeployment(fileList)

    if (deployRes2.status >= 200 && deployRes2.status < 300) {
      const d = deployRes2.data
      console.log(`\nDeployment iniciado! ID: ${d.id}`)
      console.log(`URL provisória: https://${d.url}`)
      console.log('Aguardando build concluir...')
      const final = await pollDeployment(d.id)
      if (final?.readyState === 'READY') {
        console.log(`\n✅ App no ar: https://${final.url}`)
      } else {
        console.log(`Estado final: ${final?.readyState}`)
        if (final?.errorMessage) console.log(`Erro: ${final.errorMessage}`)
      }
    } else {
      console.error('Erro ao finalizar:', JSON.stringify(deployRes2.data, null, 2))
    }
  } else {
    console.error(`Erro inesperado (${deployRes.status}):`, JSON.stringify(deployRes.data, null, 2))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
