'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Eye, EyeOff, Info, Loader2, Check, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface ChatwootConfig {
  isConfigured: boolean;
  baseUrl: string;
  apiTokenPreview: string;
  accountId: string;
  inboxId: string;
  webhookUrl: string;
}

const EMPTY_CONFIG: ChatwootConfig = {
  isConfigured: false,
  baseUrl: '',
  apiTokenPreview: '',
  accountId: '',
  inboxId: '',
  webhookUrl: '',
}

export function ChatwootPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [config, setConfig] = useState<ChatwootConfig>(EMPTY_CONFIG);
  const [isEditing, setIsEditing] = useState(false);

  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [inboxId, setInboxId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showToken, setShowToken] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/chatwoot', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        if (!data.config.isConfigured) setIsEditing(true);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const openEdit = () => {
    setBaseUrl(config.baseUrl);
    setApiToken('');
    setAccountId(config.accountId);
    setInboxId(config.inboxId);
    setWebhookUrl(config.webhookUrl);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !accountId.trim() || !inboxId.trim()) {
      toast.error('URL base, Account ID e Inbox ID são obrigatórios');
      return;
    }
    if (!config.isConfigured && !apiToken.trim()) {
      toast.error('API Token é obrigatório na primeira configuração');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/chatwoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiToken, accountId, inboxId, webhookUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        setIsEditing(false);
        setApiToken('');
        toast.success('Chatwoot configurado com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remover integração com Chatwoot? Isso desativa o espelhamento de campanhas e o forward de mensagens.')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/settings/chatwoot', { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setConfig(EMPTY_CONFIG);
        setIsEditing(true);
        toast.success('Integração Chatwoot removida');
      } else {
        toast.error(data.error || 'Erro ao remover');
      }
    } catch {
      toast.error('Erro ao remover integração');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-2 text-[var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel rounded-2xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
            <MessageSquare className="size-4 text-emerald-400" />
            Integração Chatwoot
          </div>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            Espelha entregas de campanhas no Chatwoot e encaminha mensagens recebidas.
          </p>
        </div>

        {config.isConfigured && !isEditing && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300">
              Configurado
            </span>
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              Remover
            </button>
          </div>
        )}
      </div>

      {/* Status configurado */}
      {config.isConfigured && !isEditing && (
        <div className="mt-5 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Check size={16} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--ds-text-primary)]">Chatwoot conectado</div>
              <div className="text-xs text-[var(--ds-text-muted)] font-mono mt-0.5">{config.baseUrl}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-[var(--ds-text-secondary)]">
            <div>
              <span className="text-[var(--ds-text-muted)]">Account ID</span>
              <div className="font-mono text-[var(--ds-text-primary)]">{config.accountId}</div>
            </div>
            <div>
              <span className="text-[var(--ds-text-muted)]">Inbox ID</span>
              <div className="font-mono text-[var(--ds-text-primary)]">{config.inboxId}</div>
            </div>
            <div>
              <span className="text-[var(--ds-text-muted)]">API Token</span>
              <div className="font-mono text-[var(--ds-text-primary)]">{config.apiTokenPreview || '—'}</div>
            </div>
            {config.webhookUrl && (
              <div>
                <span className="text-[var(--ds-text-muted)]">Webhook URL</span>
                <div className="font-mono text-[var(--ds-text-primary)] truncate">{config.webhookUrl}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulário de edição */}
      {isEditing && (
        <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
          {!config.isConfigured && (
            <div className="flex items-start gap-2 text-sm text-emerald-200/80">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Configure a conexão com o seu Chatwoot para espelhar campanhas e receber mensagens no inbox.
                <a
                  href="https://www.chatwoot.com/docs/product/channels/api/create-channel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 ml-1 font-medium hover:underline"
                >
                  Ver documentação <ExternalLink size={12} />
                </a>
              </p>
            </div>
          )}

          <div className="grid gap-3">
            {/* URL base */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                URL base do Chatwoot <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                placeholder="https://app.chatwoot.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>

            {/* API Token */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                API Token de Acesso {!config.isConfigured && <span className="text-red-400">*</span>}
                {config.isConfigured && <span className="text-[var(--ds-text-muted)]"> (deixe em branco para manter o atual)</span>}
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder={config.isConfigured ? config.apiTokenPreview || '••••••••' : 'user_access_token ou api_access_token'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 pr-10 text-sm text-[var(--ds-text-primary)] font-mono outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Account ID */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                  Account ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="1"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] font-mono outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>

              {/* Inbox ID */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                  Inbox ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="3"
                  value={inboxId}
                  onChange={(e) => setInboxId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] font-mono outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>
            </div>

            {/* Webhook URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                URL de webhook do Chatwoot
                <span className="ml-1 text-[var(--ds-text-muted)]">(opcional — para encaminhar mensagens recebidas)</span>
              </label>
              <input
                type="url"
                placeholder="https://app.chatwoot.com/webhooks/whatsapp/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar configuração'}
            </button>
            {config.isConfigured && (
              <button
                type="button"
                onClick={() => { setIsEditing(false); setApiToken(''); }}
                className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dica sobre uso */}
      {config.isConfigured && !isEditing && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)] p-3 text-xs text-[var(--ds-text-secondary)]">
          <Info className="mt-0.5 size-4 shrink-0 text-emerald-300/60" />
          <div>
            <p>Com o Chatwoot ativo:</p>
            <ul className="mt-1 space-y-0.5 text-[var(--ds-text-muted)]">
              <li>• Mensagens entregues de campanhas aparecem no inbox</li>
              <li>• Contatos e conversas são criados automaticamente</li>
              <li>• Mensagens recebidas são encaminhadas em tempo real</li>
              <li>• Ative "Sincronizar com Chatwoot" ao criar uma campanha</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
