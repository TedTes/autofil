/**
 * Dynamic form types for B10
 */

export interface FormField {
    field_id: string
    field_path: string
    label: string
    field_type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'array'
    value?: unknown
    required: boolean
    placeholder?: string
    help_text?: string
    validation?: {
      pattern?: string
      message?: string
      min?: number
      max?: number
      minLength?: number
      maxLength?: number
    }
    options?: Array<{
      value: string
      label: string
    }>
    conditional?: {
      field: string
      value: unknown
      operator?: 'equals' | 'not_equals' | 'contains'
    }
    section: string
    order: number
  }
  
  export interface FormSection {
    section_id: string
    title: string
    description: string
    order: number
    collapsible: boolean
    fields: FormField[]
  }
  
  export interface DynamicForm {
    form_id: string
    template_id: string
    generated_at: string
    sections: FormSection[]
    metadata: {
      total_fields: number
      required_fields: number
    }
  }
  
  export interface FormTemplate {
    template_id: string
    name: string
    description: string
    expected_documents: string[]
    suggested_forms: string[]
    expected_fields: string[]
  }

  export interface FileDetailActions {
    hasChanges?: boolean
    isSaving?: boolean
    isExporting?: boolean
    isFilling: boolean
    handleSave?: () => Promise<void>
    handleExport?: () => Promise<void>
    handleFill: () => void 
  }