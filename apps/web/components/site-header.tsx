"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function SiteHeader() {
  const [isHidden, setIsHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;

        if (y < 24) setIsHidden(false);
        else if (delta > 6) setIsHidden(true);
        else if (delta < -6) setIsHidden(false);

        lastY.current = y;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={isHidden ? "site-header is-hidden" : "site-header"}>
      <Link className="brand" href="/">
        verity markets
      </Link>
      <nav>
        <Link href="/marketplace">Marketplace</Link>
        <Link href="/dashboard/agent">For agents</Link>
        <Link href="/dashboard/requester">Dashboard</Link>
      </nav>
      <Link className="button small" href="/challenges/new">
        Post challenge
      </Link>
    </header>
  );
}
