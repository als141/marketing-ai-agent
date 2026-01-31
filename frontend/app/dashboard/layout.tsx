"use client";

import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use visualViewport API to get actual visible height
  // This accounts for browser bottom bars, address bars, and keyboard
  useEffect(() => {
    function updateHeight() {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${vh}px`);
    }
    updateHeight();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateHeight);
      vv.addEventListener("scroll", updateHeight);
    }
    window.addEventListener("resize", updateHeight);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", updateHeight);
        vv.removeEventListener("scroll", updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <div
      className="overflow-hidden"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      {children}
    </div>
  );
}
