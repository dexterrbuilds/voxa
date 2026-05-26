"use client";

import { useState, useEffect } from "react";

interface FloatingElementProps {
  children: React.ReactNode;
  className?: string;
  speed?: "slow" | "medium" | "fast";
}

export default function FloatingElement({
  children,
  className = "",
  speed = "medium",
}: FloatingElementProps) {
  const [floatingClass, setFloatingClass] = useState("");

  useEffect(() => {
    const speedClasses = {
      slow: "animate-bounce-slow",
      medium: "animate-bounce-medium",
      fast: "animate-bounce-fast",
    };

    setFloatingClass(speedClasses[speed] || speedClasses.medium);
  }, [speed]);

  return <div className={`${className} ${floatingClass}`}>{children}</div>;
}
