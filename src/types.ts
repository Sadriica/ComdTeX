export interface FileNode {
  name: string
  path: string
  type: "file" | "dir"
  ext?: string
  children?: FileNode[]
}

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  mode: "md" | "tex"
}

export interface SearchResult {
  filePath: string
  fileName: string
  line: number
  content: string
}
