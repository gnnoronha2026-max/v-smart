import { NextResponse } from 'next/server'
import { getChatwootConfig } from '@/lib/chatwoot-client'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = await getChatwootConfig()
  if (!config) {
    return NextResponse.json({ agents: [] })
  }

  try {
    const res = await fetchWithTimeout(
      `${config.baseUrl}/api/v1/accounts/${config.accountId}/agents`,
      {
        timeoutMs: 5000,
        headers: { api_access_token: config.apiToken, 'Content-Type': 'application/json' },
      }
    )
    const data = await safeJson<any[]>(res)
    const agents = (Array.isArray(data) ? data : [])
      .filter((a: any) => a?.id && a?.name)
      .map((a: any) => ({ id: Number(a.id), name: String(a.name) }))
    return NextResponse.json({ agents })
  } catch {
    return NextResponse.json({ agents: [] })
  }
}
