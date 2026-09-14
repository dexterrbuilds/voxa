"use client";

import { useState, useEffect } from "react";

interface GlowEffectProps {
  className?: string;
  children: React.ReactNode;
}

export default function GlowEffect({ className = "", children }: GlowEffectProps) {
  return (
    <div className="relative">
      {children}
      <div
        className={`absolute inset-0 rounded-full bg-purple-500/20 blur-3xl -z-10 ${className}`}
      ></div>
    </div>
  );
}
