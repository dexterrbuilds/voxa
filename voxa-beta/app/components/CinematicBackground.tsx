"use client";

import { useState, useEffect } from "react";

interface CinematicBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export default function CinematicBackground({
  children,
  className = "",
}: CinematicBackgroundProps) {
  return (
    <div className={`relative min-h-screen bg-gradient-to-br from-gray-900 to-black ${className}`}>
      {/* Ambient background effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10"></div>
        <div className="absolute top-0 left-0 w-full h-full cinematic-ambient-1"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-500/5 blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
