export interface FieldDefinition {
  id: string
  type: string
  cardinality?: string
  aliases?: string[]
  required_for?: string[]
  structure?: Record<string, string>
  targets?: Record<string, unknown>
  notes?: string
}

export interface FieldCatalog {
  schema_version?: string
  updated_at?: string
  updated_by?: string
  fields: Record<string, FieldDefinition>
}
