import { createContext, useContext } from 'react'

export interface CanvasActions {
  runNode: (nodeId: string) => void
  running: Set<string>
  uploadToNode: (nodeId: string, files: FileList | File[]) => Promise<void>
}

export const CanvasActionsContext = createContext<CanvasActions>({
  runNode: () => undefined,
  running: new Set(),
  uploadToNode: async () => undefined,
})

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext)
}
