"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "leads", label: "Leads" },
  { slug: "dashboard", label: "Dashboard" },
  { slug: "analyst", label: "Analyst" },
] as const;

export function DatasetTabs({ datasetId }: { datasetId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1" aria-label="Dataset sections">
      {TABS.map((tab) => {
        const href = `/datasets/${datasetId}/${tab.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
