import { FilesSection} from "./DocumentsFilesSection"
import { FoldersSection} from "./DocumentsFoldersSection";

import type { Folder } from '@/types'
import type { ViewType } from '@/types'

export function DocumentsView({
  folders,
  currentFolder,
  onFolderChange,
  onCreateFolder,
  onNavigate,
}: {
  folders: Folder[]
  currentFolder: Folder | null
  onFolderChange: (folder: Folder | null) => void
  onCreateFolder: (name: string) => Promise<void> | void
  onNavigate: (type: ViewType, data?: unknown, breadcrumbs?: string[]) => void
}) {
  return (
    <div className="space-y-8">
      {/* Files first */}
      <FilesSection
        currentFolder={currentFolder}
        folders={folders}
        onFolderChange={onFolderChange}
        onNavigate={onNavigate}
      />

      {/* Then folders */}
      <FoldersSection
        folders={folders}
        onCreateFolder={onCreateFolder}
        onSelectFolder={(folder) => {
          onFolderChange(folder)
          onNavigate('documents', undefined, ['Home', 'Documents', folder.name])
        }}
      />
    </div>
  )
}
