import { getChatwootConfig, findOrCreateContact, findOrCreateConversation, postIncomingMessage } from '@/lib/chatwoot-client'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker'])

const MEDIA_LABELS: Record<string, string> = {
  image: '[Imagem]',
  audio: '[Áudio]',
  video: '[Vídeo]',
  document: '[Documento]',
  sticker: '[Sticker]',
}

async function fetchMetaMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  try {
    // Passo 1: obter URL temporária da Meta
    const metaRes = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${mediaId}`,
      { timeoutMs: 5000, headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const meta = await safeJson<any>(metaRes)
    if (!meta?.url) return null

    // Passo 2: baixar o binário usando a URL temporária
    const downloadRes = await fetchWithTimeout(meta.url, {
      timeoutMs: 10000,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const buffer = Buffer.from(await downloadRes.arrayBuffer())
    const rawMime: string = meta.mime_type || 'application/octet-stream'

    // Remove parâmetros de codec: 'audio/ogg; codecs=opus' → 'audio/ogg'
    // Blobs criados com MIME composto causam falha de reprodução no navegador
    const mimeType = rawMime.split(';')[0].trim()

    const rawExt = mimeType.split('/')[1] || 'bin'
    const extMap: Record<string, string> = {
      'jpeg': 'jpg', 'x-m4a': 'm4a', 'mpeg': 'mp3', 'ogg': 'ogg',
      'mp4': 'mp4', 'webm': 'webm', 'pdf': 'pdf', 'msword': 'doc',
      'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    }
    const ext = extMap[rawExt] || rawExt
    return { buffer, mimeType, fileName: `media.${ext}` }
  } catch {
    return null
  }
}

export async function syncInboundMediaToChatwoot(options: {
  from: string
  name: string | null
  message: any
  accessToken: string
}): Promise<void> {
  const config = await getChatwootConfig()
  if (!config) return

  const { message, accessToken } = options
  const msgType: string = message.type
  if (!MEDIA_TYPES.has(msgType)) return

  const contactId = await findOrCreateContact(config, options.from, options.name || options.from)
  if (!contactId) return

  const conversationId = await findOrCreateConversation(config, contactId)
  if (!conversationId) return

  const mediaObj = message[msgType] as any
  const mediaId: string | null = mediaObj?.id || null
  const caption: string = mediaObj?.caption || ''
  const docFilename: string | null = message.document?.filename || null

  if (!mediaId) return

  const media = await fetchMetaMedia(mediaId, accessToken)

  if (!media) {
    // Fallback: texto descritivo se o download falhar (ex: token expirado)
    const label = MEDIA_LABELS[msgType] || '[Mídia]'
    const parts = [label, docFilename, caption].filter(Boolean)
    await postIncomingMessage(config, conversationId, parts.join(' — ') || label)
    return
  }

  await postIncomingMessage(config, conversationId, caption, {
    buffer: media.buffer,
    fileName: docFilename || media.fileName,
    mimeType: media.mimeType,
  })
}
