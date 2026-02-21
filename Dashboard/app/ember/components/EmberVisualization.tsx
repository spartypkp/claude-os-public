"use client";

import { useEffect, useRef } from "react";

interface EmberVisualizationProps {
  stage: string;
  mood: string;
  moodColor: string;
}

export default function EmberVisualization({
  stage,
  mood,
  moodColor,
}: EmberVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 400;

    let animationFrame: number;
    let time = 0;

    const getStageSize = () => {
      switch (stage) {
        case "spark":
          return 20;
        case "kindle":
          return 40;
        case "glow":
          return 70;
        case "blaze":
          return 100;
        case "radiance":
          return 140;
        default:
          return 20;
      }
    };

    const getComplexity = () => {
      switch (stage) {
        case "spark":
          return 1;
        case "kindle":
          return 2;
        case "glow":
          return 4;
        case "blaze":
          return 6;
        case "radiance":
          return 8;
        default:
          return 1;
      }
    };

    const getPulseSpeed = () => {
      switch (mood) {
        case "bright":
          return 0.05;
        case "warm":
          return 0.03;
        case "resting":
          return 0.02;
        case "waiting":
          return 0.01;
        default:
          return 0.02;
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseSize = getStageSize();
      const complexity = getComplexity();
      const pulseSpeed = getPulseSpeed();

      time += pulseSpeed;
      const pulse = Math.sin(time) * 0.2 + 1;
      const size = baseSize * pulse;

      // Draw glow effect
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        size * 2
      );
      gradient.addColorStop(0, moodColor + "80");
      gradient.addColorStop(0.5, moodColor + "40");
      gradient.addColorStop(1, moodColor + "00");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw geometric shape based on complexity
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(time * 0.1);

      for (let i = 0; i < complexity; i++) {
        const angle = (Math.PI * 2 * i) / complexity;
        const layerSize = size * (1 - i * 0.1);

        ctx.save();
        ctx.rotate(angle + time * 0.2);

        // Draw facet
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(layerSize, -layerSize * 0.3);
        ctx.lineTo(layerSize * 0.7, layerSize * 0.3);
        ctx.closePath();

        const facetGradient = ctx.createLinearGradient(
          0,
          0,
          layerSize,
          layerSize
        );
        facetGradient.addColorStop(0, moodColor);
        facetGradient.addColorStop(1, moodColor + "60");

        ctx.fillStyle = facetGradient;
        ctx.fill();

        ctx.strokeStyle = moodColor + "AA";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
      }

      // Draw sparkles for "bright" mood
      if (mood === "bright" && Math.random() > 0.95) {
        const sparkleX = (Math.random() - 0.5) * size * 2;
        const sparkleY = (Math.random() - 0.5) * size * 2;
        const sparkleSize = Math.random() * 3 + 1;

        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [stage, mood, moodColor]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="rounded-lg"
        style={{ filter: "drop-shadow(0 0 20px rgba(255, 165, 0, 0.3))" }}
      />
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <div className="text-orange-200 text-sm font-semibold uppercase tracking-wider">
          {stage}
        </div>
        <div className="text-orange-300/60 text-xs mt-1">
          {mood}
        </div>
      </div>
    </div>
  );
}
