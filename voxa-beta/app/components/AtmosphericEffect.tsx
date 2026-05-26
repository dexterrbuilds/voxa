"use client";

import { useState, useEffect, useRef } from "react";

interface AtmosphericEffectProps {
  className?: string;
  intensity?: "subtle" | "medium" | "strong";
}

export default function AtmosphericEffect({
  className = "",
  intensity = "medium",
}: AtmosphericEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (typeof window !== "undefined") {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create gradient background
    const gradient = ctx.createRadialGradient(
      dimensions.width / 2,
      dimensions.height / 2,
      0,
      dimensions.width / 2,
      dimensions.height / 2,
      Math.max(dimensions.width, dimensions.height) / 2,
    );

    gradient.addColorStop(0, "rgba(92, 100, 220, 0.1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Add subtle noise
    const imageData = ctx.getImageData(0, 0, dimensions.width, dimensions.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Add subtle noise based on intensity
      const noise = Math.random() * (intensity === "subtle" ? 5 : intensity === "medium" ? 10 : 15);
      data[i] = Math.min(255, data[i] + noise); // Red
      data[i + 1] = Math.min(255, data[i + 1] + noise); // Green
      data[i + 2] = Math.min(255, data[i + 2] + noise); // Blue
    }

    ctx.putImageData(imageData, 0, 0);

    const animationFrame = animationFrameRef.current;

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [dimensions, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(92, 100, 220, 0.1) 0%, transparent 70%)",
        mixBlendMode: "screen",
      }}
    />
  );
}
