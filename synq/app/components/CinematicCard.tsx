"use client";

import { useState, useEffect } from "react";

interface CinematicCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function CinematicCard({
  children,
  className = "",
  title,
  subtitle,
}: CinematicCardProps) {
  return (
    <div
      className={`bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/30 shadow-xl ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h3 className="text-xl font-light text-white">{title}</h3>
          {subtitle && <p className="text-gray-400 text-sm">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
