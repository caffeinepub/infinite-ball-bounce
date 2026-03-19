import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Circle, Plus, Trash2, Zap, ZapOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface CrackLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branches: { x1: number; y1: number; x2: number; y2: number }[];
}

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  trail: { x: number; y: number }[];
  bounces: number;
  maxBounces: number;
  cracking: boolean;
  crackProgress: number;
  crackLines: CrackLine[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  radius: number;
}

interface GameState {
  balls: Ball[];
  particles: Particle[];
  nextId: number;
  gravity: boolean;
  gravityStrength: number;
  rainbowMode: boolean;
  superSpeed: boolean;
  darkMatter: boolean;
  repulse: boolean;
  blackHole: boolean;
  lastTime: number;
}

const RESTITUTION = 0.78;
const TRAIL_LENGTH = 22;
const MAX_BALLS = 80;
const SUPER_SPEED_MULTIPLIER = 3;
const DARK_MATTER_FORCE = 90000;
const REPULSE_FORCE = 90000;
const BLACK_HOLE_FORCE = 300000;
const BLACK_HOLE_CONSUME_RADIUS = 18;

function generateCrackLines(radius: number): CrackLine[] {
  const count = 5 + Math.floor(Math.random() * 4);
  const lines: CrackLine[] = [];
  const usedAngles: number[] = [];

  for (let i = 0; i < count; i++) {
    let angle: number;
    let attempts = 0;
    do {
      angle = Math.random() * Math.PI * 2;
      attempts++;
    } while (
      attempts < 20 &&
      usedAngles.some((a) => Math.abs(a - angle) < 0.4)
    );
    usedAngles.push(angle);

    const len = (0.6 + Math.random() * 0.4) * radius;
    const midAngle = angle + (Math.random() - 0.5) * 0.4;
    const mx = Math.cos(midAngle) * len * 0.5;
    const my = Math.sin(midAngle) * len * 0.5;
    const endX = Math.cos(angle) * len;
    const endY = Math.sin(angle) * len;

    const branches: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const numBranches = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < numBranches; b++) {
      const branchAngle =
        angle +
        (Math.random() > 0.5 ? 0.5 : -0.5) * (0.6 + Math.random() * 0.6);
      const branchLen = len * (0.25 + Math.random() * 0.25);
      branches.push({
        x1: mx,
        y1: my,
        x2: mx + Math.cos(branchAngle) * branchLen,
        y2: my + Math.sin(branchAngle) * branchLen,
      });
    }

    lines.push({ x1: 0, y1: 0, x2: endX, y2: endY, branches });
    lines[lines.length - 1].x1 = mx;
    lines[lines.length - 1].y1 = my;
  }
  return lines;
}

function createBall(id: number, x: number, y: number, radius?: number): Ball {
  const speed = 80 + Math.random() * 120;
  const angle = Math.random() * Math.PI * 2;
  const r = radius ?? 18 + Math.random() * 10;
  return {
    id,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: r,
    hue: Math.random() * 360,
    trail: [],
    bounces: 0,
    maxBounces: 10 + Math.floor(Math.random() * 12),
    cracking: false,
    crackProgress: 0,
    crackLines: [],
  };
}

function spawnCollisionParticles(
  particles: Particle[],
  x: number,
  y: number,
  hue1: number,
  hue2: number,
) {
  const count = 8 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 60 + Math.random() * 140;
    const life = 0.4 + Math.random() * 0.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      hue: Math.random() < 0.5 ? hue1 : hue2,
      radius: 1.5 + Math.random() * 3,
    });
  }
}

function spawnShatterParticles(particles: Particle[], ball: Ball) {
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 120 + Math.random() * 200;
    const life = 0.5 + Math.random() * 0.6;
    particles.push({
      x: ball.x + (Math.random() - 0.5) * ball.radius,
      y: ball.y + (Math.random() - 0.5) * ball.radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      hue: ball.hue,
      radius: 2 + Math.random() * 4,
    });
  }
}

function resolveCollision(a: Ball, b: Ball, particles: Particle[]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.radius + b.radius;
  if (dist >= minDist || dist === 0) return;

  const overlap = (minDist - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const dot = dvx * nx + dvy * ny;
  if (dot > 0) return;

  const impulse = dot * RESTITUTION;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;

  if (!a.cracking) a.bounces++;
  if (!b.cracking) b.bounces++;

  spawnCollisionParticles(
    particles,
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    a.hue,
    b.hue,
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const gameRef = useRef<GameState>({
    balls: [],
    particles: [],
    nextId: 0,
    gravity: true,
    gravityStrength: 0.6,
    rainbowMode: false,
    superSpeed: false,
    darkMatter: false,
    repulse: false,
    blackHole: false,
    lastTime: 0,
  });
  const rafRef = useRef<number>(0);

  const [ballCount, setBallCount] = useState(0);
  const [gravityOn, setGravityOn] = useState(true);
  const [gravityStrength, setGravityStrength] = useState(0.6);
  const [rainbowMode, setRainbowMode] = useState(false);
  const [superSpeed, setSuperSpeed] = useState(false);
  const [darkMatter, setDarkMatter] = useState(false);
  const [repulse, setRepulse] = useState(false);
  const [blackHole, setBlackHole] = useState(false);

  useEffect(() => {
    gameRef.current.gravity = gravityOn;
  }, [gravityOn]);

  useEffect(() => {
    gameRef.current.gravityStrength = gravityStrength;
  }, [gravityStrength]);

  useEffect(() => {
    gameRef.current.rainbowMode = rainbowMode;
  }, [rainbowMode]);

  useEffect(() => {
    gameRef.current.darkMatter = darkMatter;
    if (darkMatter) {
      gameRef.current.repulse = false;
      gameRef.current.blackHole = false;
    }
  }, [darkMatter]);

  useEffect(() => {
    gameRef.current.repulse = repulse;
    if (repulse) {
      gameRef.current.darkMatter = false;
      gameRef.current.blackHole = false;
    }
  }, [repulse]);

  useEffect(() => {
    gameRef.current.blackHole = blackHole;
    if (blackHole) {
      gameRef.current.darkMatter = false;
      gameRef.current.repulse = false;
    }
  }, [blackHole]);

  const toggleSuperSpeed = useCallback(() => {
    setSuperSpeed((prev) => {
      const next = !prev;
      gameRef.current.superSpeed = next;
      const factor = next ? SUPER_SPEED_MULTIPLIER : 1 / SUPER_SPEED_MULTIPLIER;
      for (const ball of gameRef.current.balls) {
        ball.vx *= factor;
        ball.vy *= factor;
      }
      return next;
    });
  }, []);

  const toggleDarkMatter = useCallback(() => {
    setDarkMatter((prev) => {
      const next = !prev;
      if (next) {
        setRepulse(false);
        setBlackHole(false);
      }
      return next;
    });
  }, []);

  const toggleRepulse = useCallback(() => {
    setRepulse((prev) => {
      const next = !prev;
      if (next) {
        setDarkMatter(false);
        setBlackHole(false);
      }
      return next;
    });
  }, []);

  const toggleBlackHole = useCallback(() => {
    setBlackHole((prev) => {
      const next = !prev;
      if (next) {
        setDarkMatter(false);
        setRepulse(false);
      }
      return next;
    });
  }, []);

  const spawnBall = useCallback((x?: number, y?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = gameRef.current;
    if (state.balls.length >= MAX_BALLS) return;
    const bx = x ?? canvas.width / 2;
    const by = y ?? canvas.height / 2;
    const ball = createBall(state.nextId++, bx, by);
    if (state.superSpeed) {
      ball.vx *= SUPER_SPEED_MULTIPLIER;
      ball.vy *= SUPER_SPEED_MULTIPLIER;
    }
    state.balls.push(ball);
    setBallCount(state.balls.length);
  }, []);

  const clearAll = useCallback(() => {
    gameRef.current.balls = [];
    gameRef.current.particles = [];
    setBallCount(0);
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      spawnBall(e.clientX - rect.left, e.clientY - rect.top);
    },
    [spawnBall],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const state = gameRef.current;
    for (let i = 0; i < 5; i++) {
      const x = 80 + Math.random() * (canvas.width - 160);
      const y = 80 + Math.random() * (canvas.height - 160);
      state.balls.push(createBall(state.nextId++, x, y));
    }
    setBallCount(state.balls.length);

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05);
      state.lastTime = timestamp;

      ctx.fillStyle = "rgba(10, 10, 15, 0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const W = canvas.width;
      const H = canvas.height;
      const G = state.gravity ? 6000 * state.gravityStrength : 0;
      const mouse = mouseRef.current;

      // Black hole: consume balls that get too close
      let consumed = false;
      if (state.blackHole && mouse.x > -100) {
        state.balls = state.balls.filter((ball) => {
          const dx = mouse.x - ball.x;
          const dy = mouse.y - ball.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BLACK_HOLE_CONSUME_RADIUS + ball.radius * 0.3) {
            for (let i = 0; i < 12; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 40 + Math.random() * 80;
              state.particles.push({
                x: ball.x,
                y: ball.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.5 + Math.random() * 0.4,
                maxLife: 0.9,
                hue: ball.hue,
                radius: 2 + Math.random() * 3,
              });
            }
            consumed = true;
            return false;
          }
          return true;
        });
        if (consumed) setBallCount(state.balls.length);
      }

      // Advance cracking animation and remove fully shattered balls
      let shattered = false;
      for (const ball of state.balls) {
        if (ball.cracking) {
          ball.crackProgress += dt * 2.5;
          if (ball.crackProgress >= 1) {
            ball.crackProgress = 1;
          }
        }
      }
      state.balls = state.balls.filter((ball) => {
        if (ball.cracking && ball.crackProgress >= 1) {
          spawnShatterParticles(state.particles, ball);
          shattered = true;
          return false;
        }
        return true;
      });
      if (shattered) setBallCount(state.balls.length);

      for (const ball of state.balls) {
        if (state.rainbowMode) {
          ball.hue = (ball.hue + 120 * dt) % 360;
        }

        if (!ball.cracking) {
          ball.vy += G * dt;

          if (state.darkMatter && mouse.x > -100) {
            const mdx = mouse.x - ball.x;
            const mdy = mouse.y - ball.y;
            const dist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (dist > 1) {
              const strength = DARK_MATTER_FORCE / (dist + 30);
              ball.vx += (mdx / dist) * strength * dt * 60;
              ball.vy += (mdy / dist) * strength * dt * 60;
            }
          }

          if (state.repulse && mouse.x > -100) {
            const rdx = ball.x - mouse.x;
            const rdy = ball.y - mouse.y;
            const dist = Math.sqrt(rdx * rdx + rdy * rdy);
            if (dist > 1 && dist < 400) {
              const strength = REPULSE_FORCE / (dist + 20);
              ball.vx += (rdx / dist) * strength * dt * 60;
              ball.vy += (rdy / dist) * strength * dt * 60;
            }
          }

          if (state.blackHole && mouse.x > -100) {
            const bhdx = mouse.x - ball.x;
            const bhdy = mouse.y - ball.y;
            const dist = Math.sqrt(bhdx * bhdx + bhdy * bhdy);
            if (dist > 1) {
              const strength = BLACK_HOLE_FORCE / (dist + 5);
              ball.vx += (bhdx / dist) * strength * dt * 60;
              ball.vy += (bhdy / dist) * strength * dt * 60;
            }
          }

          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;

          ball.trail.push({ x: ball.x, y: ball.y });
          if (ball.trail.length > TRAIL_LENGTH) ball.trail.shift();

          if (ball.x - ball.radius < 0) {
            ball.x = ball.radius;
            ball.vx = Math.abs(ball.vx) * RESTITUTION;
            if (!ball.cracking) ball.bounces++;
          } else if (ball.x + ball.radius > W) {
            ball.x = W - ball.radius;
            ball.vx = -Math.abs(ball.vx) * RESTITUTION;
            if (!ball.cracking) ball.bounces++;
          }
          if (ball.y - ball.radius < 0) {
            ball.y = ball.radius;
            ball.vy = Math.abs(ball.vy) * RESTITUTION;
            if (!ball.cracking) ball.bounces++;
          } else if (ball.y + ball.radius > H) {
            ball.y = H - ball.radius;
            ball.vy = -Math.abs(ball.vy) * RESTITUTION;
            ball.vx *= 0.98;
            if (!ball.cracking) ball.bounces++;
          }

          if (ball.bounces >= ball.maxBounces && !ball.cracking) {
            ball.cracking = true;
            ball.crackProgress = 0;
            ball.crackLines = generateCrackLines(ball.radius);
          }
        }
      }

      for (let i = 0; i < state.balls.length; i++) {
        for (let j = i + 1; j < state.balls.length; j++) {
          resolveCollision(state.balls[i], state.balls[j], state.particles);
          const a = state.balls[i];
          const b = state.balls[j];
          if (a.bounces >= a.maxBounces && !a.cracking) {
            a.cracking = true;
            a.crackProgress = 0;
            a.crackLines = generateCrackLines(a.radius);
          }
          if (b.bounces >= b.maxBounces && !b.cracking) {
            b.cracking = true;
            b.crackProgress = 0;
            b.crackLines = generateCrackLines(b.radius);
          }
        }
      }

      // Draw dark matter cursor effect
      if (state.darkMatter && mouse.x > -100) {
        const pulseSize = 24 + Math.sin(timestamp / 200) * 8;
        const dm = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          pulseSize * 4,
        );
        dm.addColorStop(0, "hsla(270, 100%, 60%, 0.85)");
        dm.addColorStop(0.3, "hsla(270, 100%, 40%, 0.4)");
        dm.addColorStop(1, "hsla(270, 100%, 20%, 0)");
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, pulseSize * 4, 0, Math.PI * 2);
        ctx.fillStyle = dm;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, pulseSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(270, 100%, 90%, 0.95)";
        ctx.fill();
      }

      // Draw repulse cursor effect
      if (state.repulse && mouse.x > -100) {
        const pulseSize = 20 + Math.sin(timestamp / 150) * 10;
        const rg = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          400,
        );
        rg.addColorStop(0, "hsla(180, 100%, 60%, 0.0)");
        rg.addColorStop(0.05, "hsla(60, 100%, 60%, 0.15)");
        rg.addColorStop(0.3, "hsla(30, 100%, 55%, 0.08)");
        rg.addColorStop(1, "hsla(0, 100%, 50%, 0)");
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 400, 0, Math.PI * 2);
        ctx.fillStyle = rg;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, pulseSize * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(60, 100%, 85%, 0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, pulseSize * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "hsla(60, 100%, 70%, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw black hole cursor effect
      if (state.blackHole && mouse.x > -100) {
        const t = timestamp / 1000;
        for (let ring = 0; ring < 4; ring++) {
          const ringRadius = 40 + ring * 22 + Math.sin(t * 2 + ring) * 5;
          const alpha = 0.18 - ring * 0.03;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${200 + ring * 30}, 100%, 70%, ${alpha})`;
          ctx.lineWidth = 3 - ring * 0.5;
          ctx.stroke();
        }
        const lensGrad = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          BLACK_HOLE_CONSUME_RADIUS,
          mouse.x,
          mouse.y,
          120,
        );
        lensGrad.addColorStop(0, "hsla(200, 100%, 80%, 0.5)");
        lensGrad.addColorStop(0.3, "hsla(220, 100%, 50%, 0.15)");
        lensGrad.addColorStop(1, "hsla(240, 100%, 20%, 0)");
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 120, 0, Math.PI * 2);
        ctx.fillStyle = lensGrad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, BLACK_HOLE_CONSUME_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
          mouse.x,
          mouse.y,
          BLACK_HOLE_CONSUME_RADIUS + 3,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `hsla(${180 + Math.sin(t * 3) * 40}, 100%, 85%, 0.9)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw trails
      for (const ball of state.balls) {
        if (ball.trail.length < 2) continue;
        const trailAlpha = ball.cracking
          ? Math.max(0, 1 - ball.crackProgress * 2)
          : 1;
        if (trailAlpha <= 0) continue;
        for (let t = 1; t < ball.trail.length; t++) {
          const alpha = (t / ball.trail.length) * 0.5 * trailAlpha;
          const width = (t / ball.trail.length) * ball.radius * 0.7;
          ctx.beginPath();
          ctx.moveTo(ball.trail[t - 1].x, ball.trail[t - 1].y);
          ctx.lineTo(ball.trail[t].x, ball.trail[t].y);
          ctx.strokeStyle = `hsla(${ball.hue}, 100%, 65%, ${alpha})`;
          ctx.lineWidth = width;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      // Draw balls
      for (const ball of state.balls) {
        const cp = ball.cracking ? ball.crackProgress : 0;
        const displayRadius = ball.radius * (1 - cp * 0.3);
        const ballAlpha = ball.cracking ? Math.max(0, 1 - cp * 0.6) : 1;

        const glow = ctx.createRadialGradient(
          ball.x,
          ball.y,
          0,
          ball.x,
          ball.y,
          displayRadius * 2.5,
        );
        glow.addColorStop(
          0,
          `hsla(${ball.hue}, 100%, 70%, ${0.3 * ballAlpha})`,
        );
        glow.addColorStop(1, `hsla(${ball.hue}, 100%, 70%, 0)`);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, displayRadius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        const gradient = ctx.createRadialGradient(
          ball.x - displayRadius * 0.3,
          ball.y - displayRadius * 0.3,
          displayRadius * 0.1,
          ball.x,
          ball.y,
          displayRadius,
        );
        gradient.addColorStop(0, `hsla(${ball.hue}, 100%, 90%, ${ballAlpha})`);
        gradient.addColorStop(
          0.5,
          `hsla(${ball.hue}, 100%, 65%, ${ballAlpha})`,
        );
        gradient.addColorStop(1, `hsla(${ball.hue}, 80%, 35%, ${ballAlpha})`);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        const spec = ctx.createRadialGradient(
          ball.x - displayRadius * 0.35,
          ball.y - displayRadius * 0.35,
          0,
          ball.x - displayRadius * 0.35,
          ball.y - displayRadius * 0.35,
          displayRadius * 0.55,
        );
        spec.addColorStop(0, `rgba(255,255,255,${0.65 * ballAlpha})`);
        spec.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
        ctx.fillStyle = spec;
        ctx.fill();

        if (ball.cracking && ball.crackLines.length > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
          ctx.clip();

          const crackAlpha = Math.min(1, cp * 2.5);

          for (const crack of ball.crackLines) {
            ctx.beginPath();
            ctx.moveTo(ball.x, ball.y);
            ctx.lineTo(ball.x + crack.x1 * cp, ball.y + crack.y1 * cp);
            ctx.lineTo(ball.x + crack.x2 * cp, ball.y + crack.y2 * cp);
            ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha * 0.9})`;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = "round";
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(ball.x, ball.y);
            ctx.lineTo(
              ball.x + crack.x1 * cp * 0.6,
              ball.y + crack.y1 * cp * 0.6,
            );
            ctx.strokeStyle = `rgba(255, 240, 200, ${crackAlpha * 0.6})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            for (const branch of crack.branches) {
              ctx.beginPath();
              ctx.moveTo(ball.x + branch.x1 * cp, ball.y + branch.y1 * cp);
              ctx.lineTo(ball.x + branch.x2 * cp, ball.y + branch.y2 * cp);
              ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha * 0.6})`;
              ctx.lineWidth = 0.9;
              ctx.stroke();
            }
          }

          ctx.restore();

          ctx.save();
          ctx.globalAlpha = crackAlpha * 0.35;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${ball.hue}, 50%, 20%, 1)`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();

          if (cp > 0.8) {
            const flashProgress = (cp - 0.8) / 0.2;
            const flashRadius =
              displayRadius + flashProgress * displayRadius * 1.5;
            const flashAlpha = (1 - flashProgress) * 0.9;
            ctx.save();
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, flashRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 240, 150, ${flashAlpha})`;
            ctx.lineWidth = 3 * (1 - flashProgress);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, flashRadius * 0.6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha * 0.7})`;
            ctx.lineWidth = 1.5 * (1 - flashProgress);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Draw particles
      state.particles = state.particles.filter((p) => p.life > 0);
      for (const p of state.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 200 * dt;
        p.life -= dt;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#0a0a0f" }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onKeyDown={() => {}}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        data-ocid="game.canvas_target"
      />

      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 panel-glass"
      >
        <div className="flex items-center gap-2.5">
          <Circle
            className="w-4 h-4"
            style={{ color: "hsl(180, 100%, 65%)" }}
          />
          <span
            className="font-semibold tracking-wide text-sm"
            style={{
              color: "hsl(180, 100%, 80%)",
              fontFamily: "'Bricolage Grotesque', sans-serif",
            }}
          >
            INFINITY BALLS
          </span>
        </div>
        <div
          className="font-mono text-sm px-3 py-1 rounded-full"
          style={{
            background: "rgba(0,200,200,0.1)",
            border: "1px solid rgba(0,200,200,0.3)",
            color: "hsl(180, 100%, 75%)",
          }}
        >
          Active Balls: <span className="font-bold">{ballCount}</span>
        </div>
      </motion.div>

      {/* Controls panel */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="absolute top-16 right-4 panel-glass rounded-xl p-3 flex flex-col gap-1.5 w-40"
      >
        <p
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: "hsl(180, 60%, 55%)" }}
        >
          Controls
        </p>

        <Button
          className="w-full h-6 text-xs font-semibold gap-1 transition-all"
          style={{
            background:
              "linear-gradient(135deg, hsl(180,100%,35%), hsl(220,100%,40%))",
            border: "none",
            color: "white",
            boxShadow: "0 0 14px hsl(180,100%,35%,0.5)",
          }}
          onClick={() => spawnBall()}
          data-ocid="controls.add_button"
        >
          <Plus className="w-2.5 h-2.5" />
          Add Ball
        </Button>

        <Button
          variant="outline"
          className="w-full h-6 text-xs font-semibold gap-1 border-red-900/50 hover:border-red-500/70 hover:bg-red-950/40"
          style={{ color: "hsl(10, 90%, 65%)" }}
          onClick={clearAll}
          data-ocid="controls.delete_button"
        >
          <Trash2 className="w-2.5 h-2.5" />
          Clear All
        </Button>

        <div
          className="w-full h-px"
          style={{ background: "oklch(0.25 0.03 260 / 0.6)" }}
        />

        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all"
          style={{
            background: gravityOn
              ? "linear-gradient(135deg, hsl(300,90%,30%), hsl(260,90%,35%))"
              : "rgba(40,40,60,0.6)",
            border: gravityOn
              ? "1px solid hsl(300,80%,50%,0.5)"
              : "1px solid rgba(80,80,120,0.4)",
            color: gravityOn ? "hsl(300,100%,85%)" : "hsl(240,30%,60%)",
            boxShadow: gravityOn ? "0 0 12px hsl(300,80%,40%,0.4)" : "none",
          }}
          onClick={() => setGravityOn((g) => !g)}
          data-ocid="controls.toggle"
        >
          {gravityOn ? (
            <Zap className="w-2.5 h-2.5" />
          ) : (
            <ZapOff className="w-2.5 h-2.5" />
          )}
          Gravity: {gravityOn ? "ON" : "OFF"}
        </button>

        <AnimatePresence>
          {gravityOn && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <span
                    className="text-xs"
                    style={{ color: "hsl(240,20%,60%)" }}
                  >
                    Strength
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "hsl(300,80%,70%)" }}
                  >
                    {gravityStrength.toFixed(1)}x
                  </span>
                </div>
                <Slider
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  value={[gravityStrength]}
                  onValueChange={([v]) => setGravityStrength(v)}
                  className="w-full"
                  data-ocid="controls.select"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="w-full h-px"
          style={{ background: "oklch(0.25 0.03 260 / 0.6)" }}
        />

        {/* Rainbow Mode */}
        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all relative overflow-hidden"
          style={
            rainbowMode
              ? {
                  background:
                    "linear-gradient(135deg, hsl(0,100%,55%), hsl(45,100%,55%), hsl(120,100%,45%), hsl(200,100%,55%), hsl(270,100%,60%), hsl(320,100%,55%))",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "white",
                  textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                  boxShadow:
                    "0 0 16px rgba(255,100,200,0.5), 0 0 32px rgba(100,200,255,0.3)",
                }
              : {
                  background: "rgba(40,40,60,0.6)",
                  border: "1px solid rgba(80,80,120,0.4)",
                  color: "hsl(240,30%,60%)",
                }
          }
          onClick={() => setRainbowMode((r) => !r)}
          data-ocid="controls.rainbow_toggle"
        >
          <span>🌈</span>
          Rainbow: {rainbowMode ? "ON" : "OFF"}
        </button>

        {/* Super Speed Mode */}
        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all"
          style={
            superSpeed
              ? {
                  background:
                    "linear-gradient(135deg, hsl(40,100%,45%), hsl(20,100%,50%))",
                  border: "1px solid hsl(45,100%,60%,0.6)",
                  color: "hsl(40,100%,95%)",
                  boxShadow:
                    "0 0 14px hsl(40,100%,50%,0.6), 0 0 28px hsl(20,100%,45%,0.3)",
                }
              : {
                  background: "rgba(40,40,60,0.6)",
                  border: "1px solid rgba(80,80,120,0.4)",
                  color: "hsl(240,30%,60%)",
                }
          }
          onClick={toggleSuperSpeed}
          data-ocid="controls.speed_toggle"
        >
          <span>⚡</span>
          Super Speed: {superSpeed ? "ON" : "OFF"}
        </button>

        {/* Dark Matter Mode */}
        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all"
          style={
            darkMatter
              ? {
                  background:
                    "linear-gradient(135deg, hsl(270,100%,25%), hsl(290,100%,30%))",
                  border: "1px solid hsl(270,100%,55%,0.6)",
                  color: "hsl(270,100%,90%)",
                  boxShadow:
                    "0 0 14px hsl(270,100%,40%,0.7), 0 0 28px hsl(290,100%,30%,0.4)",
                }
              : {
                  background: "rgba(40,40,60,0.6)",
                  border: "1px solid rgba(80,80,120,0.4)",
                  color: "hsl(240,30%,60%)",
                }
          }
          onClick={toggleDarkMatter}
          data-ocid="controls.dark_matter_toggle"
        >
          <span>🕳️</span>
          Dark Matter: {darkMatter ? "ON" : "OFF"}
        </button>

        {/* Repulse Mode */}
        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all"
          style={
            repulse
              ? {
                  background:
                    "linear-gradient(135deg, hsl(55,100%,35%), hsl(30,100%,40%))",
                  border: "1px solid hsl(55,100%,60%,0.6)",
                  color: "hsl(55,100%,90%)",
                  boxShadow:
                    "0 0 14px hsl(55,100%,50%,0.7), 0 0 28px hsl(30,100%,40%,0.4)",
                }
              : {
                  background: "rgba(40,40,60,0.6)",
                  border: "1px solid rgba(80,80,120,0.4)",
                  color: "hsl(240,30%,60%)",
                }
          }
          onClick={toggleRepulse}
          data-ocid="controls.repulse_toggle"
        >
          <span>💥</span>
          Repulse: {repulse ? "ON" : "OFF"}
        </button>

        {/* Black Hole Mode */}
        <button
          type="button"
          className="w-full h-6 rounded-md text-xs font-semibold gap-1 flex items-center justify-center transition-all"
          style={
            blackHole
              ? {
                  background:
                    "linear-gradient(135deg, hsl(210,100%,10%), hsl(230,100%,18%))",
                  border: "1px solid hsl(200,100%,60%,0.7)",
                  color: "hsl(200,100%,85%)",
                  boxShadow:
                    "0 0 16px hsl(200,100%,40%,0.8), 0 0 32px hsl(220,100%,30%,0.5)",
                }
              : {
                  background: "rgba(40,40,60,0.6)",
                  border: "1px solid rgba(80,80,120,0.4)",
                  color: "hsl(240,30%,60%)",
                }
          }
          onClick={toggleBlackHole}
          data-ocid="controls.black_hole_toggle"
        >
          <span>⚫</span>
          Black Hole: {blackHole ? "ON" : "OFF"}
        </button>
      </motion.div>

      {/* Bottom hint */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none"
      >
        <p
          className="text-xs tracking-widest uppercase text-center px-4 py-2 rounded-full"
          style={{
            background: "rgba(10,10,20,0.7)",
            border: "1px solid rgba(100,200,255,0.15)",
            color: "rgba(150,200,255,0.55)",
            backdropFilter: "blur(8px)",
          }}
        >
          ✦ Click anywhere to add a ball · Balls crack after too many bounces ✦
        </p>
      </motion.div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 text-center py-1 text-xs pointer-events-none"
        style={{ color: "rgba(100,120,150,0.35)" }}
      >
        © {new Date().getFullYear()}. Built with ♥ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          className="underline pointer-events-auto hover:opacity-70 transition-opacity"
          style={{ color: "rgba(100,180,200,0.4)" }}
          target="_blank"
          rel="noreferrer"
        >
          caffeine.ai
        </a>
      </div>
    </div>
  );
}
