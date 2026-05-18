import {
  getChatwootConfig,
  findOrCreateContact,
  findOrCreateConversation,
  postOutgoingMessage,
  addContactLabels,
  addConversationLabels,
} from '@/lib/chatwoot-client'

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

function renderTemplateBody(
  templateSnapshot: any,
  bodyValues: string[]
): string {
  try {
    const components: any[] = templateSnapshot?.components ?? []
    const bodyComponent = components.find(
      (c: any) => String(c?.type || '').toUpperCase() === 'BODY'
    )
    if (!bodyComponent?.text) return ''

    let text: string = bodyComponent.text
    bodyValues.forEach((value, idx) => {
      text = text.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), value)
    })
    return text
  } catch {
    return ''
  }
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
    const rendered = renderTemplateBody(templateSnapshot, templateVariables?.body ?? [])
    content = rendered || `[Campanha: ${campaignName}]`
  } else {
    content = `[Campanha: ${campaignName}]`
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
