import { cn } from "@/lib/utils"
import type { Status } from "@/lib/types"

// Dot + label, always together — the label carries the meaning, the color
// only reinforces it.
const DOT: Record<Status, string> = {
  sent: "bg-emerald-500",
  failed: "bg-red-500",
  skipped_unmapped: "bg-amber-500",
  skipped_expired: "bg-amber-500",
  skipped_duplicate: "bg-muted-foreground/50",
  test_sent: "bg-sky-500",
}

const LABEL: Record<Status, string> = {
  sent: "Sent",
  failed: "Failed",
  skipped_unmapped: "Unmapped",
  skipped_expired: "Expired",
  skipped_duplicate: "Duplicate",
  test_sent: "Test",
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          DOT[status] ?? "bg-muted-foreground/50",
        )}
      />
      {LABEL[status] ?? status}
    </span>
  )
}

export function statusLabel(status: Status): string {
  return LABEL[status] ?? status
}
