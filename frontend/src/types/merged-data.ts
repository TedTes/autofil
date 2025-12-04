import type { EntityValue } from './canonical'

export interface SemanticField {
  id: string
  label?: string
  type?: string
  aliases?: string[]
  values: EntityValue[]
}

export interface SemanticSection {
  key: string
  displayName?: string
  description?: string
  priority?: number
  icon?: string
  fields: SemanticField[]
}

export interface MergedData {
  semantic_sections: SemanticSection[]
}
