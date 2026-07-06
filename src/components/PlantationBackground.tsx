import React, { useEffect, useRef } from "react";

interface Leaf {
  heightY: number;   // Position along the stalk (0 to 1)
  length: number;    // Length of the leaf
  direction: number; // Left (-1) or Right (1)
  angleOffset: number; // Angular offset from the stalk
}

interface Stalk {
  x: number;
  height: number;
  thickness: number;
  windFlexibility: number;
  phaseOffset: number;
  opacity: number;
  leaves: Leaf[];
  currentBend: number; // For smooth interpolation of mouse repulsion
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  opacity: number;
}

export default function PlantationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number; lastX: number; speedX: number }>({
    x: -1000,
    y: -1000,
    lastX: -1000,
    speedX: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let stalks: Stalk[] = [];
    let particles: Particle[] = [];

    // Initialize crop field stalks and floating particles
    const initElements = (width: number, height: number) => {
      stalks = [];
      particles = [];

      // Denser fields for a full realistic horizon of crops
      const stalkCount = Math.min(Math.floor(width / 6.5), 260);
      for (let i = 0; i < stalkCount; i++) {
        const x = Math.random() * width;
        // Natural distribution: background stalks are shorter, foreground are taller
        const heightFactor = 0.15 + (Math.random() * 0.22); // 15% to 37% of screen height
        const h = height * heightFactor;
        const thickness = 0.7 + Math.random() * 1.0;
        const windFlexibility = 0.5 + Math.random() * 0.8;
        const phaseOffset = Math.random() * Math.PI * 2;
        
        // Very low opacity to guarantee it never obstructs information blocks (ranging from 0.015 to 0.04)
        const opacity = 0.015 + Math.random() * 0.025;

        // Alternate organic side leaves
        const leafCount = 4 + Math.floor(Math.random() * 4);
        const leaves: Leaf[] = [];
        for (let j = 0; j < leafCount; j++) {
          leaves.push({
            heightY: 0.2 + (j / leafCount) * 0.6, // distributed naturally
            length: 12 + Math.random() * 18,
            direction: Math.random() > 0.5 ? 1 : -1,
            angleOffset: 0.35 + Math.random() * 0.3
          });
        }

        stalks.push({
          x,
          height: h,
          thickness,
          windFlexibility,
          phaseOffset,
          opacity,
          leaves,
          currentBend: 0
        });
      }

      // Sort by height so drawing renders background elements first for visual depth
      stalks.sort((a, b) => a.height - b.height);

      // Organic spores/floating light nodes
      const particleCount = 35;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: height + Math.random() * 100,
          size: 0.8 + Math.random() * 1.4,
          speedY: 0.4 + Math.random() * 0.6,
          amplitude: 0.5 + Math.random() * 1.5,
          frequency: 0.002 + Math.random() * 0.004,
          phase: Math.random() * Math.PI * 2,
          opacity: 0.02 + Math.random() * 0.05
        });
      }
    };

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      initElements(window.innerWidth, window.innerHeight);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = mouseRef.current;
      if (mouse.lastX === -1000) {
        mouse.lastX = e.clientX;
      } else {
        mouse.lastX = mouse.x;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.speedX = (mouse.x - mouse.lastX) * 0.15; // smooth factor of speed
    };

    const handleMouseLeave = () => {
      const mouse = mouseRef.current;
      mouse.x = -1000;
      mouse.y = -1000;
      mouse.speedX = 0;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    
    handleResize();

    // Core Animation loop simulating physical organic wind waving & cursor attraction
    const render = (time: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      const elapsed = time * 0.001; // seconds
      const mouse = mouseRef.current;

      // Dampen mouse speed over time
      mouse.speedX *= 0.95;

      // 1. Draw subtle ambient ground mist gradient
      const mistGradient = ctx.createLinearGradient(0, height * 0.65, 0, height);
      mistGradient.addColorStop(0, "rgba(0,0,0,0)");
      mistGradient.addColorStop(1, "rgba(16, 185, 129, 0.01)");
      ctx.fillStyle = mistGradient;
      ctx.fillRect(0, height * 0.65, width, height * 0.35);

      // 2. Draw stalks with physical bending curves
      stalks.forEach((stalk) => {
        // Calculate distance between cursor and stalk
        const dxToMouse = mouse.x - stalk.x;
        // Vertically check if mouse is within a reasonable distance of the crop height
        const dyToMouse = mouse.y - (height - stalk.height);

        // Targeted local force from cursor
        let targetLocalRepulsion = 0;
        
        // If cursor is active and near the crop bottom-height
        if (mouse.x !== -1000 && mouse.y !== -1000) {
          const distanceX = Math.abs(dxToMouse);
          const influenceRadiusX = 80; // Smaller radius of cursor force influence
          
          if (distanceX < influenceRadiusX && dyToMouse > -70) {
            // Stronger push the closer the cursor is
            const distanceFactor = 1.0 - (distanceX / influenceRadiusX); // 0 to 1
            
            // Push crop away from cursor's X position
            const direction = dxToMouse > 0 ? -1 : 1;
            
            // Add a very small push force + extremely small reactive sway based on speed
            const speedInfluence = Math.min(Math.abs(mouse.speedX), 2.0) * 0.04;
            targetLocalRepulsion = direction * (distanceFactor * 0.12 + speedInfluence);
          }
        }

        // Smoothly interpolate current repulsion bend slowly to avoid any sudden movements
        stalk.currentBend += (targetLocalRepulsion - stalk.currentBend) * 0.04;

        // Physical Wind Wave calculation:
        // A macro wind gust (sine waves rolling through screen) + localized vibration
        const waveX = stalk.x * 0.003;
        
        // Global wind leans extremely slightly towards where the cursor is positioned on screen (adds subtle parallax depth)
        const cursorLean = mouse.x !== -1000 ? ((mouse.x / width) - 0.5) * 0.04 : 0;
        
        const windWave = Math.sin(elapsed * 0.9 - waveX) * Math.cos(elapsed * 0.4 + waveX * 0.5);
        const flutter = Math.sin(elapsed * 2.5 + stalk.phaseOffset) * 0.12;
        
        // Combine natural wind wave, global cursor tilt bias, and interactive brush repulsion
        const totalWindAngle = ((windWave * 1.5 + flutter + cursorLean) * stalk.windFlexibility * 0.15) + stalk.currentBend;

        ctx.save();
        ctx.strokeStyle = `rgba(16, 185, 129, ${stalk.opacity})`;
        ctx.fillStyle = `rgba(16, 185, 129, ${stalk.opacity})`;
        ctx.lineWidth = stalk.thickness;
        ctx.lineCap = "round";

        const startX = stalk.x;
        const startY = height + 15; // slightly below viewport to hide roots

        // Calculate bending curve points
        // Root is fixed, upper parts flex more. We calculate curve points along a flexible stalk
        const pointsCount = 4;
        const pts: { x: number; y: number }[] = [];
        
        for (let j = 0; j <= pointsCount; j++) {
          const t = j / pointsCount;
          const segmentY = startY - stalk.height * t;
          
          // Displacement curves upwards exponentially (base/root doesn't move, tip moves most)
          const bendFactor = Math.pow(t, 2.2);
          const segmentX = startX + Math.sin(totalWindAngle) * stalk.height * bendFactor;
          
          pts.push({ x: segmentX, y: segmentY });
        }

        // Draw main stalk line through curved points
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length; j++) {
          // Use quadratic segment approximation for extreme smoothness
          const xc = (pts[j - 1].x + pts[j].x) / 2;
          const yc = (pts[j - 1].y + pts[j].y) / 2;
          ctx.quadraticCurveTo(pts[j - 1].x, pts[j - 1].y, xc, yc);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();

        // 3. Draw alternate leaves branching gracefully
        stalk.leaves.forEach((leaf) => {
          // Find the exact point along the bending stalk curve
          const t = leaf.heightY;
          const index = Math.floor(t * pointsCount);
          const nextIndex = Math.min(index + 1, pointsCount);
          const ratio = (t * pointsCount) % 1;

          // Interpolate position on stalk
          const p1 = pts[index];
          const p2 = pts[nextIndex];
          const jointX = p1.x + (p2.x - p1.x) * ratio;
          const jointY = p1.y + (p2.y - p1.y) * ratio;

          // Calculate stalk tangent angle to grow leaves organically outward
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const stalkAngle = Math.atan2(dy, dx);

          // Leaf curves downward naturally due to weight, responding beautifully to wind bend
          const growthDirection = leaf.direction; // -1 (left) or 1 (right)
          const leafAngle = stalkAngle + (growthDirection * leaf.angleOffset) - (totalWindAngle * 0.15);
          const leafLength = leaf.length * (0.65 + t * 0.35); // leaves get slightly shorter toward the top

          // Draw double-curve natural leaf arc
          const leafEndX = jointX + Math.cos(leafAngle) * leafLength;
          const leafEndY = jointY + Math.sin(leafAngle) * leafLength;

          // Control point creates an elegant downward arch
          const leafCtrlX = jointX + Math.cos(leafAngle - growthDirection * 0.35) * (leafLength * 0.55);
          const leafCtrlY = jointY + Math.sin(leafAngle - growthDirection * 0.35) * (leafLength * 0.55) + 3; // pull down slightly for gravity

          ctx.beginPath();
          ctx.moveTo(jointX, jointY);
          ctx.quadraticCurveTo(leafCtrlX, leafCtrlY, leafEndX, leafEndY);
          ctx.stroke();
        });

        // 4. Draw detailed biological Spikelet/Wheat Grain Cluster at tip
        const tip = pts[pts.length - 1];
        const prevTip = pts[pts.length - 2];
        const tipAngle = Math.atan2(tip.y - prevTip.y, tip.x - prevTip.x);

        const grainCount = 6;
        const grainSpacing = 4.2;

        for (let g = 0; g < grainCount; g++) {
          const progress = g / (grainCount - 1);
          const dist = g * grainSpacing;
          
          // Positioning along the grain spine
          const gx = tip.x + Math.cos(tipAngle) * dist;
          const gy = tip.y + Math.sin(tipAngle) * dist;

          const grainSize = 2.0 - progress * 0.6; // get smaller toward the very top
          const grainSpread = 0.32 + Math.sin(elapsed * 1.5 + stalk.phaseOffset) * 0.04;

          // Left seed
          ctx.beginPath();
          ctx.ellipse(
            gx + Math.cos(tipAngle - grainSpread) * 1.8,
            gy + Math.sin(tipAngle - grainSpread) * 1.8,
            grainSize,
            grainSize * 1.4,
            tipAngle - grainSpread,
            0,
            Math.PI * 2
          );
          ctx.fill();

          // Right seed
          ctx.beginPath();
          ctx.ellipse(
            gx + Math.cos(tipAngle + grainSpread) * 1.8,
            gy + Math.sin(tipAngle + grainSpread) * 1.8,
            grainSize,
            grainSize * 1.4,
            tipAngle + grainSpread,
            0,
            Math.PI * 2
          );
          ctx.fill();

          // Delicate botanical hairlines (Awns/Aristas) curving upwards
          ctx.beginPath();
          ctx.lineWidth = 0.4;
          ctx.moveTo(gx, gy);
          // Hair curves upward from grain spike
          const hairAngleLeft = tipAngle - 0.4;
          const hairAngleRight = tipAngle + 0.4;
          ctx.quadraticCurveTo(
            gx + Math.cos(hairAngleLeft) * 6, gy + Math.sin(hairAngleLeft) * 6,
            gx + Math.cos(hairAngleLeft) * 11, gy + Math.sin(hairAngleLeft) * 11
          );
          ctx.moveTo(gx, gy);
          ctx.quadraticCurveTo(
            gx + Math.cos(hairAngleRight) * 6, gy + Math.sin(hairAngleRight) * 6,
            gx + Math.cos(hairAngleRight) * 11, gy + Math.sin(hairAngleRight) * 11
          );
          ctx.stroke();
          ctx.lineWidth = stalk.thickness;
        }

        ctx.restore();
      });

      // 5. Draw realistic wind particles (gently floating spores rising up)
      particles.forEach((p) => {
        // Organic horizontal drift simulating ambient gentle draft + mouse wind velocity pull
        const mouseWindInfluence = mouse.x !== -1000 ? mouse.speedX * 0.15 : 0;
        p.x += Math.sin(elapsed * p.frequency + p.phase) * p.amplitude * 0.4 + mouseWindInfluence;
        p.y -= p.speedY;

        // Wrap particles around screen edges
        if (p.y < -20) {
          p.y = height + Math.random() * 50;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.beginPath();
        ctx.fillStyle = `rgba(52, 211, 153, ${p.opacity})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 select-none block w-full h-full bg-transparent"
    />
  );
}
