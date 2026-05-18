import {
  getChatwootConfig,
  findOrCreateContact,
  findOrCreateConversation,
  postOutgoingMessage,
  addContactLabels,
  addConversationLabels,
} from '@/lib/chatwoot-client'
import { renderTemplatePreviewText } from '@/lib/whatsapp/template-contract'
import type { ResolvedTemplateValues } from '@/lib/whatsapp/template-contract'

export interface CampaignDeliverySyncParams {
  phone: string
  name: string | null
  campaignName: string
  chatwootLabel: string | null
  /** Template object do banco (template_snapshot) */
  templateSnapshot: any | null
  /** Variáveis da campanha { header: string[], body: string[], buttons? } */
  templateVariables: { header?: string[]; body?: string[] } | null
}

function buildResolvedValues(
  templateVariables: { header?: string[]; body?: string[] } | null
): ResolvedTemplateValues {
  return {
    body: (templateVariables?.body ?? []).map((text, i) => ({ key: String(i + 1), text })),
    header: (templateVariables?.header ?? []).map((text, i) => ({ key: String(i + 1), text })),
  }
}

function buildFallbackContent(campaignName: string): string {
  return `[Campanha: ${campaignName}]`
}

export async function syncCampaignDeliveryToChatwoot(params: CampaignDeliverySyncParams): Promise<void> {
  const { phone, name, campaignName, chatwootLabel, templateSnapshot, templateVariables } = params

  const config = await getChatwootConfig()
  if (!config) {
    console.warn('[Chatwoot Sync] configuração incompleta — sync ignorado')
    return
  }

  let content: string
  if (templateSnapshot) {
    try {
      content = renderTemplatePreviewText(templateSnapshot, buildResolvedValues(templateVariables))
    } catch {
      content = buildFallbackContent(campaignName)
    }
  } else {
    content = buildFallbackContent(campaignName)
  }

  const contactId = await findOrCreateContact(config, phone, name || phone)
  if (!contactId) {
    console.error('[Chatwoot Sync] não foi possível criar/encontrar contato', phone)
    return
  }

  const conversationId = await findOrCreateConversation(config, contactId)
  if (!conversationId) {
    console.error('[Chatwoot Sync] não foi possível criar/encontrar conversa', contactId)
    return
  }

  await postOutgoingMessage(config, conversationId, content)
  await addConversationLabels(config, conversationId, [campaignName.toLowerCase().replace(/\s+/g, '-')])

  if (chatwootLabel) {
    await addContactLabels(config, contactId, [chatwootLabel])
  }
}
