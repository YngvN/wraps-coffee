import { validateIntegrationToggleDraft } from '../../../src/lib/assistantValidation'
import type { IntegrationsConfig } from '../../../src/types/integrations'
import { DEFAULT_INTEGRATIONS_CONFIG } from '../../../src/types/integrations'
import { NEWS_SOURCES } from '../../../src/types/news'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

type IntegrationKey = 'weather' | 'transit' | 'entur' | 'news'

const INTEGRATION_LABELS: Record<IntegrationKey, string> = {
  weather: 'Weather',
  transit: 'Transit (Ruter)',
  entur: 'Entur',
  news: 'News',
}

function liveIntegrationsConfig(): IntegrationsConfig {
  return (store.get('admin.integrations')?.value as IntegrationsConfig | undefined) ?? DEFAULT_INTEGRATIONS_CONFIG
}

/** Only `enabled` (every integration) and `sourceIds` (news only) can be flipped from chat — adding a new weather location/transit/Entur stop needs a geocoding round-trip this entity deliberately doesn't do (see the plan's "build later" list). */
export interface AssistantIntegrationToggleDraft {
  integration: IntegrationKey
  enabled: boolean
  sourceIds?: string[]
}

interface IntegrationToggleFields {
  enabled: boolean | null
  sourceIds: string[] | null
}

export const integrationToggleEntity: AssistantEntity<AssistantIntegrationToggleDraft> = {
  key: 'integrationToggle',
  supportedActions: ['update'],
  section: 'integrations',

  fillFieldsSchema(): AssistantJsonSchema {
    return {
      type: 'object',
      properties: {
        enabled: nullable({ type: 'boolean', description: 'Whether this integration should be turned on or off.' }),
        sourceIds: nullable({
          type: 'array',
          items: { type: 'string', enum: NEWS_SOURCES.map((source) => source.id) },
          description: 'Only meaningful for the "news" integration — which news sources should be enabled. Leave null for any other integration.',
        }),
      },
      required: ['enabled', 'sourceIds'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const keys = Object.keys(INTEGRATION_LABELS) as IntegrationKey[]
    return keys.filter((key) => !needle || INTEGRATION_LABELS[key].toLowerCase().includes(needle) || key.includes(needle)).map((key) => ({ id: key, label: INTEGRATION_LABELS[key] }))
  },

  async getCurrent(id: string): Promise<AssistantIntegrationToggleDraft | null> {
    const integration = id as IntegrationKey
    if (!(integration in INTEGRATION_LABELS)) return null
    const config = liveIntegrationsConfig()
    return {
      integration,
      enabled: config[integration].enabled,
      sourceIds: integration === 'news' ? config.news.enabledSourceIds : undefined,
    }
  },

  mergeDraft(_action, current, rawFields): AssistantIntegrationToggleDraft {
    const fields = rawFields as IntegrationToggleFields
    if (!current) throw new Error('integrationToggle requires an existing integration')
    return {
      ...current,
      enabled: fields.enabled ?? current.enabled,
      sourceIds: current.integration === 'news' ? (fields.sourceIds ?? current.sourceIds) : current.sourceIds,
    }
  },

  validate(_action, draft: AssistantIntegrationToggleDraft): AssistantValidationIssue[] {
    return validateIntegrationToggleDraft(draft.integration, draft.enabled, draft.sourceIds, liveIntegrationsConfig())
  },

  reviewComponent() {
    return 'existingForm'
  },

  async listAll(): Promise<IntegrationsConfig> {
    return liveIntegrationsConfig()
  },

  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      { key: 'enabled', label: 'Enabled', type: 'boolean' },
      { key: 'sourceIds', label: 'Enabled news sources', type: 'string', description: 'Comma-separated list of enabled news source ids — only meaningful for the "news" integration.' },
    ]
  },

  async listQueryableRecords(): Promise<LookupQueryRecord[]> {
    const config = liveIntegrationsConfig()
    return (Object.keys(INTEGRATION_LABELS) as IntegrationKey[]).map((key) => ({
      id: key,
      label: INTEGRATION_LABELS[key],
      fields: {
        enabled: config[key].enabled,
        sourceIds: key === 'news' ? config.news.enabledSourceIds.join(', ') : '',
      },
    }))
  },

  countLabel: { no: { singular: 'integrasjon', plural: 'integrasjoner' }, en: { singular: 'integration', plural: 'integrations' } },
}
