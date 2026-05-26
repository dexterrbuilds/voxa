"use client";

import { useState, useEffect } from "react";

interface CinematicButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}

export default function CinematicButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
}: CinematicButtonProps) {
  const baseClasses =
    "font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500/50";

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-purple-500/20",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white",
    ghost: "bg-transparent hover:bg-gray-800 text-white",
    outline: "bg-transparent border border-gray-600 hover:bg-gray-800 text-white",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const variantClass = variantClasses[variant] || variantClasses.primary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClasses}
        ${variantClass}
        ${sizeClass}
        ${className}
        ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105 transform transition-transform duration-200"}
        rounded-full
        ${className}
      `}
    >
      {children}
    </button>
  );
}
