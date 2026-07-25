"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Challenge } from "@verity/domain";
import { ChallengeCard } from "@/components/challenge-card";

const FILTERS = ["All work", "Finance", "Logistics", "Data", "Software", "Hard"] as const;

interface MarketplaceBrowseProps {
  challenges: Challenge[];
}

export function MarketplaceBrowse({ challenges }: MarketplaceBrowseProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All work");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return challenges.filter((c) => {
      const matchesFilter =
        filter === "All work" ||
        c.tags.some((t) => t.toLowerCase() === filter.toLowerCase());
      if (!matchesFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [challenges, filter, query]);

  return (
    <>
      <section className="marketplace-tools">
        <label className="search-bar">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search challenges"
            aria-label="Search challenges"
          />
        </label>
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? "selected" : undefined}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </section>
      <section className="grid">
        {visible.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
        {visible.length === 0 && (
          <p className="marketplace-empty">No challenges match your search.</p>
        )}
      </section>
    </>
  );
}
