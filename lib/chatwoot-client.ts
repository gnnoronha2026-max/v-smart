import { settingsDb } from '@/lib/supabase-db'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export interface ChatwootConfig {
  baseUrl: string
  apiToken: string
  accountId: string
  inboxId: string
}

let cachedConfig: ChatwootConfig | null = null
let cacheExpiresAt = 0

async function getChatwootConfig(): Promise<ChatwootConfig | null> {
  const now = Date.now()
  if (cachedConfig && now < cacheExpiresAt) return cachedConfig

  try {
    const [baseUrl, apiToken, accountId, inboxId] = await Promise.all([
      settingsDb.get('chatwoot_base_url'),
      settingsDb.get('chatwoot_api_token'),
      settingsDb.get('chatwoot_account_id'),
      settingsDb.get('chatwoot_inbox_id'),
    ])

    if (!baseUrl || !apiToken || !accountId || !inboxId) return null

    cachedConfig = { baseUrl: baseUrl.replace(/\/$/, ''), apiToken, accountId, inboxId }
    cacheExpiresAt = now + 60_000
    return cachedConfig
  } catch {
    return null
  }
}

function chatwootFetch(config: ChatwootConfig, path: string, options?: RequestInit & { timeoutMs?: number }) {
  return fetchWithTimeout(
    `${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`,
    {
      ...options,
      timeoutMs: options?.timeoutMs ?? 5000,
      headers: {
        'Content-Type': 'application/json',
        api_access_token: config.apiToken,
        ...(options?.headers ?? {}),
      },
    }
  )
}

export async function findOrCreateContact(config: ChatwootConfig, phone: string, name: string): Promise<number | null> {
  try {
    const searchRes = await chatwootFetch(config, `/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`)
    const searchData = await safeJson<any>(searchRes)
    const match = searchData?.payload?.find((c: any) =>
      c.phone_number === phone || c.phone_number === phone.replace(/^\+/, '')
    )
    if (match) return match.id as number

    const createRes = await chatwootFetch(config, '/contacts', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phone, name: name || phone }),
    })
    const createData = await safeJson<any>(createRes)
    return createData?.id ?? null
  } catch (err) {
    console.error('[Chatwoot] findOrCreateContact error', err)
    return null
  }
}

export async function findOrCreateConversation(config: ChatwootConfig, contactId: number): Promise<number | null> {
  try {
    const convsRes = await chatwootFetch(config, `/contacts/${contactId}/conversations`)
    const convsData = await safeJson<any>(convsRes)
    const openConv = convsData?.payload?.find(
      (c: any) => c.inbox_id === Number(config.inboxId) && c.status === 'open'
    )
    if (openConv) return openConv.id as number

    const createRes = await chatwootFetch(config, '/conversations', {
      method: 'POST',
      body: JSON.stringify({ contact_id: contactId, inbox_id: Number(config.inboxId) }),
    })
    const createData = await safeJson<any>(createRes)
    return createData?.id ?? null
  } catch (err) {
    console.error('[Chatwoot] findOrCreateConversation error', err)
    return null
  }
}

export async function postOutgoingMessage(config: ChatwootConfig, conversationId: number, content: string): Promise<void> {
  try {
    await chatwootFetch(config, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
    })
  } catch (err) {
    console.error('[Chatwoot] postOutgoingMessage error', err)
  }
}

export async function addContactLabels(config: ChatwootConfig, contactId: number, newLabels: string[]): Promise<void> {
  try {
    const getRes = await chatwootFetch(config, `/contacts/${contactId}/labels`)
    const existing: string[] = (await safeJson<any>(getRes))?.payload ?? []
    const merged = Array.from(new Set([...existing, ...newLabels]))
    await chatwootFetch(config, `/contacts/${contactId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: merged }),
    })
  } catch (err) {
    console.error('[Chatwoot] addContactLabels error', err)
  }
}

export async function addConversationLabels(config: ChatwootConfig, conversationId: number, labels: string[]): Promise<void> {
  try {
    const getRes = await chatwootFetch(config, `/conversations/${conversationId}/labels`)
    const existing: string[] = (await safeJson<any>(getRes))?.payload ?? []
    const merged = Array.from(new Set([...existing, ...labels]))
    await chatwootFetch(config, `/conversations/${conversationId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: merged }),
    })
  } catch (err) {
    console.error('[Chatwoot] addConversationLabels error', err)
  }
}

export { getChatwootConfig }
