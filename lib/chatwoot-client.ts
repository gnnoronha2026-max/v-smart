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

export async function postOutgoingMessage(
  config: ChatwootConfig,
  conversationId: number,
  content: string,
  options?: { private?: boolean }
): Promise<void> {
  try {
    await chatwootFetch(config, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: options?.private ?? false,
      }),
    })
  } catch (err) {
    console.error('[Chatwoot] postOutgoingMessage error', err)
  }
}

export async function postIncomingMessage(
  config: ChatwootConfig,
  conversationId: number,
  content: string,
  attachment?: { buffer: Buffer; fileName: string; mimeType: string }
): Promise<void> {
  try {
    if (attachment) {
      const formData = new FormData()
      if (content) formData.append('content', content)
      formData.append('message_type', 'incoming')
      formData.append('private', 'false')
      const blob = new Blob([new Uint8Array(attachment.buffer)], { type: attachment.mimeType })
      formData.append('attachments[]', blob, attachment.fileName)

      // Não passar Content-Type — o fetch define automaticamente com o boundary do FormData
      const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`
      await fetchWithTimeout(url, {
        method: 'POST',
        timeoutMs: 15000,
        headers: { api_access_token: config.apiToken },
        body: formData as unknown as BodyInit,
      })
    } else {
      await chatwootFetch(config, `/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: content || ' ', message_type: 'incoming', private: false }),
      })
    }
  } catch (err) {
    console.error('[Chatwoot] postIncomingMessage error', err)
  }
}

/**
 * Garante que uma etiqueta existe na conta do Chatwoot.
 * O Chatwoot ignora silenciosamente labels não cadastradas — é necessário
 * criá-las antes de aplicá-las a contatos/conversas.
 */
export async function ensureAccountLabelExists(config: ChatwootConfig, labelTitle: string): Promise<void> {
  try {
    const listRes = await chatwootFetch(config, '/labels', { timeoutMs: 8000 })
    const listData = await safeJson<any>(listRes)
    const existing: any[] = listData?.payload ?? []
    const alreadyExists = existing.some(
      (l: any) => String(l?.title ?? '').toLowerCase() === labelTitle.toLowerCase()
    )
    if (alreadyExists) return

    // Cria a label com cor padrão azul
    const createRes = await chatwootFetch(config, '/labels', {
      method: 'POST',
      timeoutMs: 8000,
      body: JSON.stringify({
        title: labelTitle,
        color: '#1F93FF',
        show_on_sidebar: true,
        description: `Etiqueta criada automaticamente pela campanha`,
      }),
    })
    if (!createRes.ok) {
      const errBody = await safeJson<any>(createRes)
      console.warn('[Chatwoot] ensureAccountLabelExists: falha ao criar label', labelTitle, createRes.status, errBody)
    }
  } catch (err) {
    console.error('[Chatwoot] ensureAccountLabelExists error', err)
  }
}

export async function addContactLabels(config: ChatwootConfig, contactId: number, newLabels: string[]): Promise<void> {
  try {
    const getRes = await chatwootFetch(config, `/contacts/${contactId}/labels`)
    const getBody = await safeJson<any>(getRes)
    const existing: string[] = getBody?.payload ?? []
    const merged = Array.from(new Set([...existing, ...newLabels]))
    const postRes = await chatwootFetch(config, `/contacts/${contactId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: merged }),
    })
    if (!postRes.ok) {
      const errBody = await safeJson<any>(postRes)
      console.warn('[Chatwoot] addContactLabels: resposta não-OK', postRes.status, errBody)
    }
  } catch (err) {
    console.error('[Chatwoot] addContactLabels error', err)
  }
}

export async function assignConversationAgent(config: ChatwootConfig, conversationId: number, agentId: number): Promise<void> {
  try {
    await chatwootFetch(config, `/conversations/${conversationId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ assignee_id: agentId }),
    })
  } catch (err) {
    console.error('[Chatwoot] assignConversationAgent error', err)
  }
}

export async function addConversationLabels(config: ChatwootConfig, conversationId: number, labels: string[]): Promise<void> {
  try {
    const getRes = await chatwootFetch(config, `/conversations/${conversationId}/labels`)
    const getBody = await safeJson<any>(getRes)
    const existing: string[] = getBody?.payload ?? []
    const merged = Array.from(new Set([...existing, ...labels]))
    const postRes = await chatwootFetch(config, `/conversations/${conversationId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: merged }),
    })
    if (!postRes.ok) {
      const errBody = await safeJson<any>(postRes)
      console.warn('[Chatwoot] addConversationLabels: resposta não-OK', postRes.status, errBody)
    }
  } catch (err) {
    console.error('[Chatwoot] addConversationLabels error', err)
  }
}

export { getChatwootConfig }
