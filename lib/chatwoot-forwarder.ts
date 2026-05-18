import { settingsDb } from '@/lib/supabase-db'
import { fetchWithTimeout } from '@/lib/server-http'
import { validateWebhookUrl } from '@/lib/business/settings/webhook'

let cachedUrl: string | null | undefined = undefined
let cacheExpiresAt = 0

async function getChatwootWebhookUrl(): Promise<string | null> {
  const now = Date.now()
  if (cachedUrl !== undefined && now < cacheExpiresAt) return cachedUrl

  try {
    const url = (await settingsDb.get('chatwoot_webhook_url')) ?? ''
    const validation = validateWebhookUrl(url)
    cachedUrl = validation.isValid ? url : null
    cacheExpiresAt = now + 60_000
    return cachedUrl
  } catch {
    cachedUrl = null
    return null
  }
}

export async function forwardToChatwoot(payload: unknown): Promise<void> {
  const url = await getChatwootWebhookUrl()
  if (!url) return

  try {
    await fetchWithTimeout(url, {
      method: 'POST',
      timeoutMs: 3000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[Chatwoot Forward] erro ao encaminhar payload', err)
  }
}
