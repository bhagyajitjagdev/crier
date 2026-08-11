import { Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return <Megaphone className={cn("text-orange-500", className)} />
}
