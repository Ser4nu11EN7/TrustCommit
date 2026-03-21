import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timeDisplay, setTimeDisplay] = useState("SYSTEM INIT — 00:00:00");
  const [pingVal, setPingVal] = useState(12);
  const [heroHover, setHeroHover] = useState(false);
  const [consolePulse, setConsolePulse] = useState(false);
  const [heroTitle, setHeroTitle] = useState("TrustCommit");
  const [heroSubtitle, setHeroSubtitle] = useState("AGENT ACCOUNTABILITY LAYER");

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --bg: #0A0A0A;
        --ink: #E8E6E0;
        --ink-dim: #888880;
        --hairline: rgba(232, 230, 224, 0.1);
      }
      * { cursor: crosshair; box-sizing: border-box; }
      body {
        background-color: #0A0A0A;
        color: #E8E6E0;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
      }
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: #0A0A0A; border-left: 1px solid rgba(232,230,224,0.1); }
      ::-webkit-scrollbar-thumb { background: #222; }
      ::-webkit-scrollbar-thumb:hover { background: #444; }
      .bio-text { transition: opacity 0.2s; }
      .bio-text:hover { filter: url(#noise-dither); }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short"
      });
      setTimeDisplay(`SYSTEM ONLINE — ${timeString}`);
      if (Math.random() > 0.8) {
        setPingVal(8 + Math.floor(Math.random() * 14));
      }
    };
    const interval = setInterval(updateTime, 1000);
    updateTime();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const titleTarget = heroHover || consolePulse ? "CONSOLE" : "TrustCommit";
    const subtitleTarget = heroHover || consolePulse ? "LIVE CONSOLE ACCESS" : "AGENT ACCOUNTABILITY LAYER";
    const charset = " ./\\|-_~^:;=+[]{}()<>01";

    let frame = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scramble = (from: string, to: string, progress: number) => {
      const maxLength = Math.max(from.length, to.length);
      const revealCount = Math.floor(maxLength * progress);
      return Array.from({ length: maxLength }, (_, index) => {
        const targetChar = to[index] ?? " ";
        if (targetChar === " ") {
          return " ";
        }
        if (index < revealCount) {
          return targetChar;
        }
        return charset[Math.floor(Math.random() * charset.length)];
      }).join("");
    };

    const tick = () => {
      const progress = Math.min(frame / 11, 1);
      setHeroTitle(scramble(heroTitle, titleTarget, progress));
      setHeroSubtitle(scramble(heroSubtitle, subtitleTarget, progress));

      if (progress < 1) {
        frame += 1;
        timeoutId = setTimeout(tick, 38);
      } else {
        setHeroTitle(titleTarget);
        setHeroSubtitle(subtitleTarget);
      }
    };

    tick();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [heroHover, consolePulse]);

  useEffect(() => {
    let pulseTimeout: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const triggerPulse = () => {
      setConsolePulse(true);
      pulseTimeout = setTimeout(() => {
        setConsolePulse(false);
      }, 3000);
    };

    const initialTimeout = setTimeout(() => {
      triggerPulse();
      intervalId = setInterval(triggerPulse, 6400);
    }, 2200);

    return () => {
      clearTimeout(initialTimeout);
      if (pulseTimeout) {
        clearTimeout(pulseTimeout);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let width = 0;
    let height = 0;
    let mouse = { x: -9999, y: -9999, vx: 0, vy: 0 };
    let lastMouse = { x: 0, y: 0 };
    const COLS = 130;
    let rows = 0;
    let cellW = 0;
    let cellH = 0;
    let time = 0;
    let animFrameId = 0;

    let phase = "intro";
    let introProgress = 0;
    const INTRO_DURATION = 180;

    let zoomTarget = 1.0;
    let zoomCurrent = 1.0;
    let speedTarget = 1.0;
    let speedCurrent = 1.0;
    let scrollBoost = 0;

    let glitchMode = false;
    let glitchStrip: Array<{ row: number; shift: number }> = [];

    const RGB_COLS = ["#1A2222", "#221A1A", "#1A1A22"];
    let rgbAccents: Array<{ cx: number; cy: number; col: string; life: number; maxLife: number }> = [];
    let accentTimer = 0;

    const waveChars = " .,;:!|/\\-_~^`01".split("");
    const glitchChars = "/\\|!?;:.,+=-~^01".split("");

    let h1DistortStrength = 0;
    let h1DistortCurrent = 0;

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      width = parent.offsetWidth;
      height = parent.offsetHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      cellW = width / COLS;
      cellH = cellW * 1.55;
      rows = Math.ceil(height / cellH);
    }

    const handleWheel = (e: WheelEvent) => {
      if (window.scrollY < window.innerHeight) {
        scrollBoost = Math.min(scrollBoost + Math.abs(e.deltaY) * 0.015, 4);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.vx = e.clientX - lastMouse.x;
      mouse.vy = e.clientY - lastMouse.y;
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;

      let detected: "h1" | null = null;

      const h1El = document.getElementById("main-heading");
      if (h1El && window.scrollY < window.innerHeight) {
        const h1Rect = h1El.getBoundingClientRect();
        const pad = 40;
        const inside =
          e.clientX >= h1Rect.left - pad &&
          e.clientX <= h1Rect.right + pad &&
          e.clientY >= h1Rect.top - pad &&
          e.clientY <= h1Rect.bottom + pad;
        if (inside) {
          detected = "h1";
        }
      }

      if (detected === "h1") {
        zoomTarget = 1.08;
        speedTarget = 0.7;
        h1DistortStrength = 1.0;
      } else {
        zoomTarget = 1.0;
        speedTarget = phase === "idle" ? 0.2 : 1.0;
        h1DistortStrength = 0;
      }
      glitchMode = false;
    };

    function waveAmp(x: number, l: number, t: number, spd: number) {
      const nx = x / COLS;
      return (
        0.2 * Math.sin(nx * 6.2 + t * 1.1 * spd + l * 1.3) +
        0.12 * Math.sin(nx * 14.8 - t * 1.7 * spd + l * 2.1) +
        0.07 * Math.sin(nx * 28 + t * 2.3 * spd - l * 0.7) +
        0.04 * Math.sin(nx * 53 - t * 3.1 * spd + l * 4.0)
      );
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      if (phase === "intro") {
        introProgress += 1;
        if (introProgress >= INTRO_DURATION) {
          phase = "idle";
          speedTarget = 0.2;
          zoomTarget = 1.0;
        }
      }

      const lerpK = 0.04;
      zoomCurrent += (zoomTarget - zoomCurrent) * lerpK;
      speedCurrent += (speedTarget - speedCurrent) * lerpK;
      h1DistortCurrent += (h1DistortStrength - h1DistortCurrent) * 0.05;
      scrollBoost *= 0.94;

      const effectiveSpeed = speedCurrent + scrollBoost;
      time += 0.01 * effectiveSpeed;
      accentTimer += 1;

      const rgbRate = phase === "intro" ? 8 : glitchMode ? 10 : 30;
      if (accentTimer % rgbRate === 0) {
        const count = glitchMode ? 4 : phase === "intro" ? 2 : 1;
        for (let i = 0; i < count; i += 1) {
          const cx = Math.floor(Math.random() * COLS);
          const cy = Math.floor(Math.random() * rows);
          const col = RGB_COLS[Math.floor(Math.random() * RGB_COLS.length)];
          rgbAccents.push({ cx, cy, col, life: 0, maxLife: glitchMode ? 15 : 35 });
        }
        if (rgbAccents.length > 15) {
          rgbAccents.splice(0, 4);
        }
      }
      rgbAccents.forEach((a) => {
        a.life += 1;
      });
      rgbAccents = rgbAccents.filter((a) => a.life < a.maxLife);

      if (glitchMode && accentTimer % 5 === 0) {
        glitchStrip = [{ row: Math.floor(Math.random() * rows), shift: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.floor(Math.random() * 5)) }];
      } else if (phase === "intro" && introProgress < 80 && accentTimer % 12 === 0) {
        glitchStrip = [{ row: Math.floor(Math.random() * rows), shift: (Math.random() > 0.5 ? 1 : -1) * 3 }];
      } else if (!glitchMode) {
        glitchStrip = [];
      }

      const velMag = Math.hypot(mouse.vx, mouse.vy);
      const CHAR_SIZE = Math.max(9, Math.round(cellH * 0.75));
      ctx.font = `${CHAR_SIZE}px "Fragment Mono", monospace`;

        ctx.save();
        const cx0 = width / 2;
        const cy0 = height / 2;
        ctx.translate(cx0, cy0);
        ctx.scale(zoomCurrent, zoomCurrent);
        ctx.translate(-cx0, -cy0);

        const toScaledSpace = (sx: number, sy: number) => ({
          x: cx0 + (sx - cx0) / zoomCurrent,
          y: cy0 + (sy - cy0) / zoomCurrent
        });

        const scaledMouse = toScaledSpace(mouse.x, mouse.y);

        const h1El = document.getElementById("main-heading");
        let h1Rect: DOMRect | null = null;
        let canvasRect: DOMRect | null = null;
      if (h1El && h1DistortCurrent > 0.01 && window.scrollY < window.innerHeight) {
        h1Rect = h1El.getBoundingClientRect();
        canvasRect = canvas.getBoundingClientRect();
      }

      for (let row = 0; row < rows; row += 1) {
        const strip = glitchStrip.find((s) => s.row === row);
        const colShift = strip ? strip.shift : 0;

        for (let col = 0; col < COLS; col += 1) {
            const px = (col + colShift) * cellW + cellW / 2;
            const py = row * cellH + cellH / 2;

            const dx = px - scaledMouse.x;
            const dy = py - scaledMouse.y;
            const dist = Math.hypot(dx, dy);
            const RADIUS = 160;
            const affected = dist < RADIUS;

          const BANDS = 6;
          const bandH = rows / BANDS;
          const band = Math.floor(row / bandH);
          const bandT = (row % bandH) / bandH;

          const amp = waveAmp(col, band, time, effectiveSpeed);
          const center = 0.5 + amp;
          const dist2center = Math.abs(bandT - center);
          const thickness = 0.25 + (phase === "intro" ? 0.1 : 0);
          const waveDensity = Math.exp(-(dist2center * dist2center) / (thickness * thickness * 0.5));

          const charIdx = Math.floor(waveDensity * (waveChars.length - 1));
          let char = waveChars[Math.min(charIdx, waveChars.length - 1)];
          let opacity = waveDensity * (phase === "intro" ? 0.85 : 0.65);

          let renderX = px;
          let renderY = py;

          if (affected) {
            const f = (RADIUS - dist) / RADIUS;
            renderX += (dx / (dist || 1)) * f * 20;
            renderY += (dy / (dist || 1)) * f * 20;
            opacity = Math.min(1, opacity + f * 0.4);
            if (velMag > 3) {
              char = Math.random() > 0.5 ? "0" : "1";
            }
          }

            if (h1DistortCurrent > 0.01 && h1Rect && canvasRect) {
              const hCenterScreenX = h1Rect.left + h1Rect.width / 2 - canvasRect.left;
              const hCenterScreenY = h1Rect.top + h1Rect.height / 2 - canvasRect.top;
              const scaledHeading = toScaledSpace(hCenterScreenX, hCenterScreenY);
              const hcx = scaledHeading.x;
              const hcy = scaledHeading.y;
              const hdx = px - hcx;
              const hdy = py - hcy;
            const hd = Math.hypot(hdx, hdy);
            const falloff = Math.max(0, 1 - hd / 280);
            if (falloff > 0) {
              const breathe = Math.sin(time * 1.2) * 0.5 + 0.5;
              const push = falloff * h1DistortCurrent * breathe * 22;
              renderX += (hdx / (hd || 1)) * push;
              renderY += (hdy / (hd || 1)) * push * 0.7;
              if (falloff > 0.5) {
                opacity = Math.max(opacity, falloff * h1DistortCurrent * 0.6);
              }
              if (falloff > 0.6 && falloff < 0.8 && Math.random() < h1DistortCurrent * 0.4) {
                char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
              }
            }
          }

          if (glitchMode && Math.random() < 0.03) {
            char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
            opacity = 0.4 + Math.random() * 0.3;
          }

          const acc = rgbAccents.find((a) => a.cx === col && a.cy === row);
          if (acc) {
            const t01 = acc.life / acc.maxLife;
            const alpha = Math.sin(t01 * Math.PI) * 0.8;
            const hx = acc.col;
            const r = parseInt(hx.slice(1, 3), 16);
            const g = parseInt(hx.slice(3, 5), 16);
            const b = parseInt(hx.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillText(char || ".", renderX, renderY);
          } else if (char && char !== " " && opacity > 0.03) {
            ctx.fillStyle = `rgba(232,230,224,${opacity})`;
            ctx.fillText(char, renderX, renderY);
          }
        }
      }

      ctx.restore();
      animFrameId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", handleWheel, { passive: true });
    document.addEventListener("mousemove", handleMouseMove);
    draw();

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", handleWheel);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div className="font-sans" style={{ backgroundColor: "#0A0A0A", color: "#E8E6E0", fontFamily: "'DM Sans', sans-serif" }}>
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
        <defs>
          <filter id="noise-dither">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 100 -20" />
            <feComposite operator="in" in2="SourceGraphic" />
            <feBlend mode="screen" in2="SourceGraphic" />
          </filter>
        </defs>
      </svg>

        <div className="relative z-10 flex min-h-screen w-full flex-col">
          <div className="relative h-[85vh] w-full overflow-hidden border-b border-[rgba(232,230,224,0.1)] bg-[#0A0A0A]">
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
            <div
              className="pointer-events-auto absolute bottom-16 left-10 z-20 max-w-4xl md:left-20"
              onMouseEnter={() => setHeroHover(true)}
              onMouseLeave={() => setHeroHover(false)}
            >
              <div
                aria-hidden="true"
                className="absolute -left-10 -top-12 h-40 w-[28rem] rounded-full bg-[rgba(0,0,0,0.48)] blur-3xl md:h-52 md:w-[36rem]"
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Enter live console"
                className="relative z-10 w-fit outline-none"
                onClick={() => navigate("/console")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate("/console");
                  }
                }}
              >
                <h1
                  id="main-heading"
                  className="relative z-10 mb-6 text-5xl font-light leading-[1.05] tracking-tight text-[#E8E6E0] md:text-[5rem]"
                  style={{
                    transform: "translateY(-10px)",
                    textShadow:
                      "0 2px 10px rgba(0,0,0,0.72), 0 10px 32px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.14)"
                  }}
                >
                  {heroTitle}
                </h1>
                <p
                  className="relative z-10 text-[0.86rem] font-medium uppercase tracking-[0.28em] text-[#B6B0A4] md:text-[0.98rem]"
                  style={{
                    transform: "translateY(-10px)",
                    textShadow: "0 2px 8px rgba(0,0,0,0.68), 0 6px 20px rgba(0,0,0,0.42)"
                  }}
                >
                  {heroSubtitle}
                </p>
              </div>
            </div>
        </div>

          <div className="grid h-auto grid-cols-1 content-start gap-5 border-b border-[rgba(232,230,224,0.1)] bg-[#0A0A0A] px-10 py-5 md:h-[15vh] md:grid-cols-12 md:gap-x-8 md:gap-y-4 md:px-20 md:py-10">
            <div className="flex flex-col gap-3 md:col-span-6">
              <div>
                <span className="mb-1.5 block font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-wider text-[#888880]">
                  {timeDisplay}
                </span>
                <p className="bio-text max-w-none whitespace-nowrap text-[1.02rem] font-medium leading-none tracking-tight text-[#F1EEE8] md:text-[1.12rem]">
                  TrustCommit makes agent commitments, execution, and outcomes verifiable, challengeable, and accountable.
                </p>
            </div>
            <div>
              <p className="text-[0.85rem] font-light text-[#888880]">Built for verifiable execution.</p>
            </div>
          </div>

              <div className="flex flex-col gap-2 text-[0.95rem] font-light md:col-span-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[rgba(232,230,224,0.14)] pt-1.5 text-[0.8rem] tracking-[0.08em] text-[#8E897F]">
                  <a
                    href="https://github.com/Ser4nu11EN7/TrustCommit#readme"
                    target="_blank"
                  rel="noreferrer"
                  className="transition-all hover:text-[#D3CEC2]"
                >
                  Docs <span className="ml-1 font-['Fragment_Mono'] text-[0.68rem]">↗</span>
                </a>
                <a
                  href="https://github.com/Ser4nu11EN7/TrustCommit"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-all hover:text-[#D3CEC2]"
                >
                  GitHub <span className="ml-1 font-['Fragment_Mono'] text-[0.68rem]">↗</span>
                </a>
              </div>
            </div>

            <div className="mt-4 flex h-full flex-col justify-between text-right font-['Fragment_Mono'] text-[0.65rem] text-[#888880] md:col-span-2 md:mt-0">
              <div>
                PROTOCOL V1.0.0
                <br />
                ACCOUNTABILITY CORE
              </div>
            <div>
              SYS <span className="text-[#E8E6E0]">{pingVal}</span>ms
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
