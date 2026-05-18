import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEYS = {
  baseUrl: 'chatwoot_base_url',
  apiToken: 'chatwoot_api_token',
  accountId: 'chatwoot_account_id',
  inboxId: 'chatwoot_inbox_id',
  webhookUrl: 'chatwoot_webhook_url',
} as const

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase não configurado' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }

    const [baseUrl, apiToken, accountId, inboxId, webhookUrl] = await Promise.all([
      settingsDb.get(KEYS.baseUrl),
      settingsDb.get(KEYS.apiToken),
      settingsDb.get(KEYS.accountId),
      settingsDb.get(KEYS.inboxId),
      settingsDb.get(KEYS.webhookUrl),
    ])

    const isConfigured = Boolean(baseUrl && apiToken && accountId && inboxId)

    return NextResponse.json({
      ok: true,
      config: {
        isConfigured,
        baseUrl: baseUrl ?? '',
        apiTokenPreview: apiToken ? `••••${apiToken.slice(-4)}` : '',
        accountId: accountId ?? '',
        inboxId: inboxId ?? '',
        webhookUrl: webhookUrl ?? '',
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[chatwoot settings] GET error:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao buscar configurações' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase não configurado' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { baseUrl, apiToken, accountId, inboxId, webhookUrl } = body

    if (typeof baseUrl !== 'string' || typeof accountId !== 'string' || typeof inboxId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Campos obrigatórios inválidos' }, { status: 400 })
    }

    const saves: Promise<void>[] = [
      settingsDb.set(KEYS.baseUrl, baseUrl.trim()),
      settingsDb.set(KEYS.accountId, accountId.trim()),
      settingsDb.set(KEYS.inboxId, inboxId.trim()),
      settingsDb.set(KEYS.webhookUrl, typeof webhookUrl === 'string' ? webhookUrl.trim() : ''),
    ]

    // Só sobrescreve o token se vier preenchido (evita apagar ao editar outros campos)
    if (typeof apiToken === 'string' && apiToken.trim().length > 0) {
      saves.push(settingsDb.set(KEYS.apiToken, apiToken.trim()))
    }

    await Promise.all(saves)

    const [savedToken] = await Promise.all([settingsDb.get(KEYS.apiToken)])
    const isConfigured = Boolean(baseUrl.trim() && savedToken && accountId.trim() && inboxId.trim())

    return NextResponse.json({
      ok: true,
      message: 'Configurações do Chatwoot salvas',
      config: {
        isConfigured,
        baseUrl: baseUrl.trim(),
        apiTokenPreview: savedToken ? `••••${savedToken.slice(-4)}` : '',
        accountId: accountId.trim(),
        inboxId: inboxId.trim(),
        webhookUrl: typeof webhookUrl === 'string' ? webhookUrl.trim() : '',
      },
    })
  } catch (error) {
    console.error('[chatwoot settings] POST error:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao salvar configurações' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase não configurado' }, { status: 400 })
    }

    await Promise.all(Object.values(KEYS).map((k) => settingsDb.set(k, '')))

    return NextResponse.json({ ok: true, message: 'Integração Chatwoot removida' })
  } catch (error) {
    console.error('[chatwoot settings] DELETE error:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao remover configurações' }, { status: 500 })
  }
}
