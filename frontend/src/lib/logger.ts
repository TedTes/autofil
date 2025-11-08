/**
 * Debug logging configuration
 * Set to false in production to disable verbose logs
 */
export const DEBUG_TRANSFORM = process.env.NODE_ENV === 'development'

/**
 * Logger utility for transformation debugging
 */
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (DEBUG_TRANSFORM) {
      console.log(`🔄 [Transform] ${message}`, ...args)
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`⚠️ [Transform] ${message}`, ...args)
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`❌ [Transform] ${message}`, ...args)
  },
  success: (message: string, ...args: unknown[]) => {
    if (DEBUG_TRANSFORM) {
      console.log(`✅ [Transform] ${message}`, ...args)
    }
  },
  group: (title: string) => {
    if (DEBUG_TRANSFORM) {
      console.group(`📦 [Transform] ${title}`)
    }
  },
  groupEnd: () => {
    if (DEBUG_TRANSFORM) {
      console.groupEnd()
    }
  }
}