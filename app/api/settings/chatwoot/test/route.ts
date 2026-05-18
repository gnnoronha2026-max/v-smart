import { NextResponse } from 'next/server'
import { getChatwootConfig } from '@/lib/chatwoot-client'
import { settingsDb } from '@/lib/supabase-db'
import { fetchWithTimeout } from '@/lib/server-http'
import { validateWebhookUrl } from '@/lib/business/settings/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const results: { api: ApiResult; webhook: WebhookResult } = {
    api: { ok: false, message: '' },
    webhook: { ok: null, message: '' },
  }

  // ── 1. Testa credenciais da API do Chatwoot ────────────────────────────────
  try {
    const config = await getChatwootConfig()

    if (!config) {
      results.api = { ok: false, message: 'Configuração incompleta (URL, token, account ID ou inbox ID ausentes)' }
    } else {
      const res = await fetchWithTimeout(
        `${config.baseUrl}/api/v1/accounts/${config.accountId}/inboxes`,
        {
          method: 'GET',
          timeoutMs: 5000,
          headers: { api_access_token: config.apiToken, 'Content-Type': 'application/json' },
        }
      )

      if (res.ok) {
        let inboxFound = false
        try {
          const data = await res.json() as any
          const inboxes: any[] = data?.payload ?? []
          inboxFound = inboxes.some((i: any) => String(i.id) === String(config.inboxId))
        } catch { /* ignora parse error */ }

        results.api = inboxFound
          ? { ok: true, message: `Conectado — inbox ${config.inboxId} encontrado` }
          : { ok: true, message: `API acessível, mas inbox ID ${config.inboxId} não encontrado na lista` }
      } else {
        const text = await res.text().catch(() => '')
        results.api = {
          ok: false,
          message: `Erro HTTP ${res.status}${text ? ': ' + text.slice(0, 120) : ''}`,
        }
      }
    }
  } catch (err: any) {
    results.api = { ok: false, message: `Falha de conexão: ${err?.message ?? String(err)}` }
  }

  // ── 2. Testa URL de webhook (se configurada) ───────────────────────────────
  try {
    const webhookUrl = await settingsDb.get('chatwoot_webhook_url')

    if (!webhookUrl?.trim()) {
      results.webhook = { ok: null, message: 'URL de webhook não configurada (opcional)' }
    } else {
      const validation = validateWebhookUrl(webhookUrl)
      if (!validation.isValid) {
        results.webhook = { ok: false, message: `URL inválida: ${validation.error}` }
      } else {
        const testPayload = {
          object: 'whatsapp_business_account',
          entry: [{
            id: 'test',
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '0000000000', phone_number_id: 'test' },
                messages: [{
                  id: 'wamid.test_chatwoot_connection',
                  from: '5500000000000',
                  type: 'text',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: '[SmartZap] Teste de conexão com Chatwoot' },
                }],
              },
              field: 'messages',
            }],
          }],
        }

        const res = await fetchWithTimeout(webhookUrl, {
          method: 'POST',
          timeoutMs: 4000,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        })

        results.webhook = res.ok
          ? { ok: true, message: `Webhook respondeu ${res.status} — payload entregue` }
          : { ok: false, message: `Webhook retornou HTTP ${res.status}` }
      }
    }
  } catch (err: any) {
    results.webhook = { ok: false, message: `Falha ao chamar webhook: ${err?.message ?? String(err)}` }
  }

  const allOk = results.api.ok && (results.webhook.ok === null || results.webhook.ok === true)

  return NextResponse.json({ ok: allOk, results })
}

interface ApiResult { ok: boolean; message: string }
interface WebhookResult { ok: boolean | null; message: string }
