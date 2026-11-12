import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"

// The one icon system: Lucide, monochrome via currentColor, uniform stroke.
// Import icons from here, never straight from "lucide-react", so the set the
// app uses stays curated in one place (and each icon is a per-file ESM import,
// so only the ones listed below reach the bundle).
export {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpAZ,
  AtSign,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Cloud,
  Command,
  Copy,
  CornerDownLeft,
  Cpu,
  Download,
  ExternalLink,
  File,
  FilePlus,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Hash,
  Highlighter,
  ImagePlus,
  Info,
  LayoutGrid,
  Library,
  Link2,
  ListTree,
  Menu,
  MessageSquare,
  Minus,
  Newspaper,
  Notebook,
  Pencil,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings,
  Sigma,
  Sparkles,
  Square,
  StretchVertical,
  Tag,
  Timer,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

export type { LucideIcon }

export type IconSize = 14 | 16

interface IconProps {
  icon: LucideIcon
  /** 14 for dense chrome (tabs, tree rows, badges), 16 elsewhere. */
  size?: IconSize
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string
  className?: string
  style?: CSSProperties
}

/** Thin wrapper: uniform stroke, currentColor, decorative unless labelled. */
export function Icon({ icon: Glyph, size = 16, label, className, style }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={className ? `icon ${className}` : "icon"}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  )
}
