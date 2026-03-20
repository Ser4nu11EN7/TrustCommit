import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timeDisplay, setTimeDisplay] = useState("SYS INIT — 00:00:00");
  const [pingVal, setPingVal] = useState(12);

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
      .corner-idx {
        position: fixed;
        font-size: 4rem;
        font-weight: 300;
        font-family: 'DM Sans', sans-serif;
        line-height: 1;
        z-index: 100;
        user-select: none;
        color: #E8E6E0;
        transition: opacity 0.3s, transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
        mix-blend-mode: difference;
      }
      .corner-idx.glitch-active { opacity: 0.4; }
      .tl { top: 0; left: 0; padding: 2.5rem; }
      .tr { top: 0; right: 0; padding: 2.5rem; }
      .bl { bottom: 0; left: 0; padding: 2.5rem; }
      .br { bottom: 0; right: 0; padding: 2.5rem; }
      @media (max-width: 768px) {
        .corner-idx { font-size: 2rem; padding: 1.5rem; }
      }
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
      setTimeDisplay(`SYS ALIVE — ${timeString}`);
      if (Math.random() > 0.8) {
        setPingVal(8 + Math.floor(Math.random() * 14));
      }
    };
    const interval = setInterval(updateTime, 1000);
    updateTime();
    return () => clearInterval(interval);
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

      const cornerEls = document.querySelectorAll(".corner-idx");
      let detected: "corner" | "h1" | null = null;

      cornerEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (d < 100) {
          detected = "corner";
          el.classList.add("glitch-active");
        } else {
          el.classList.remove("glitch-active");
        }
      });

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
      } else if (detected === "corner") {
        zoomTarget = 1.15;
        speedTarget = 1.5;
        h1DistortStrength = 0;
      } else {
        zoomTarget = 1.0;
        speedTarget = phase === "idle" ? 0.2 : 1.0;
        h1DistortStrength = 0;
      }
      glitchMode = detected === "corner";
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

          const dx = px - mouse.x / zoomCurrent;
          const dy = py - mouse.y / zoomCurrent;
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
            const hcx = h1Rect.left + h1Rect.width / 2 - canvasRect.left;
            const hcy = h1Rect.top + h1Rect.height / 2 - canvasRect.top;
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

      <div className="corner-idx tl">T</div>
      <div className="corner-idx tr">C</div>
      <div className="corner-idx bl">0</div>
      <div className="corner-idx br">1</div>

      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <div className="relative h-[70vh] w-full overflow-hidden border-b border-[rgba(232,230,224,0.1)] bg-[#0A0A0A]">
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
          <div className="pointer-events-auto absolute bottom-16 left-10 z-20 max-w-4xl md:left-20">
            <h1 id="main-heading" className="mb-6 text-5xl font-light leading-[1.05] tracking-tight text-[#E8E6E0] md:text-[5rem]">
              Accountable
              <br />
              Autonomous Agents
            </h1>
            <p className="max-w-2xl text-lg font-light tracking-tight text-[#888880] md:text-xl">
              Agents already know how to act. TrustCommit makes them answer for what they do with commitments, receipts, verification, and dispute-ready execution.
            </p>
          </div>
        </div>

        <div className="grid h-auto grid-cols-1 content-start gap-10 border-b border-[rgba(232,230,224,0.1)] bg-[#0A0A0A] p-10 md:h-[30vh] md:grid-cols-12 md:gap-8 md:p-20">
          <div className="flex flex-col gap-6 md:col-span-6">
            <div>
              <span className="mb-3 block font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-wider text-[#888880]">
                {timeDisplay}
              </span>
              <p className="bio-text max-w-md text-[0.95rem] font-light leading-relaxed text-[#E8E6E0]">
                TrustCommit is the missing accountability layer for the autonomous web: identity, stake, covenant boundaries, evidence policies, receipt heads, and consequences.
              </p>
            </div>
            <div>
              <p className="text-[0.85rem] font-light text-[#888880]">Built for verifiable execution.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-[0.95rem] font-light md:col-span-4">
            <a
              href="#"
              className="w-fit border-b border-transparent pb-1 text-[#E8E6E0] transition-all hover:border-[rgba(232,230,224,0.1)] hover:opacity-60"
            >
              Read Whitepaper <span className="font-['Fragment_Mono'] text-xs">↗</span>
            </a>
            <a
              href="https://github.com/Ser4nu11EN7/TrustCommit#readme"
              target="_blank"
              rel="noreferrer"
              className="w-fit border-b border-transparent pb-1 text-[#E8E6E0] transition-all hover:border-[rgba(232,230,224,0.1)] hover:opacity-60"
            >
              View Documentation <span className="font-['Fragment_Mono'] text-xs">↗</span>
            </a>
            <Link
              to="/console"
              className="w-fit border-b border-transparent pb-1 text-[#E8E6E0] transition-all hover:border-[rgba(232,230,224,0.1)] hover:opacity-60"
            >
              Inspect Live Console <span className="font-['Fragment_Mono'] text-xs">↗</span>
            </Link>
            <a
              href="https://github.com/Ser4nu11EN7/TrustCommit"
              target="_blank"
              rel="noreferrer"
              className="w-fit border-b border-transparent pb-1 text-[#E8E6E0] transition-all hover:border-[rgba(232,230,224,0.1)] hover:opacity-60"
            >
              GitHub Repository <span className="font-['Fragment_Mono'] text-xs">↗</span>
            </a>
          </div>

          <div className="mt-8 flex h-full flex-col justify-between text-right font-['Fragment_Mono'] text-[0.65rem] text-[#888880] md:col-span-2 md:mt-0">
            <div>
              PROTOCOL V1.0.0
              <br />
              MAINNET BETA
            </div>
            <div>
              SYS <span className="text-[#E8E6E0]">{pingVal}</span>ms
            </div>
          </div>
        </div>

        <main className="w-full bg-[#0A0A0A]">
          <section className="grid grid-cols-1 border-b border-[rgba(232,230,224,0.1)] md:grid-cols-2">
            <div className="flex min-h-[40vh] flex-col justify-between border-b border-[rgba(232,230,224,0.1)] p-10 transition-colors duration-500 hover:bg-[#111] md:border-b-0 md:border-r md:border-[rgba(232,230,224,0.1)] md:p-20">
              <div className="mb-12 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#888880]">// The Status Quo</div>
              <div>
                <h2 className="mb-6 text-3xl font-light tracking-tight text-[#E8E6E0] md:text-4xl">Unverifiable Action</h2>
                <p className="max-w-md text-[0.95rem] font-light leading-relaxed text-[#888880]">
                  Current AI agents operate in black boxes. They take actions on behalf of users without cryptographic proof of intent, execution steps, or constraints adherence. In the current paradigm, trust is assumed, never proven.
                </p>
              </div>
            </div>

            <div className="flex min-h-[40vh] flex-col justify-between p-10 transition-colors duration-500 hover:bg-[#111] md:p-20">
              <div className="mb-12 flex items-center gap-2 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#E8E6E0]">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                // The TrustCommit Standard
              </div>
              <div>
                <h2 className="mb-6 text-3xl font-light tracking-tight text-[#E8E6E0] md:text-4xl">Cryptographic Truth</h2>
                <p className="max-w-md text-[0.95rem] font-light leading-relaxed text-[#888880]">
                  TrustCommit introduces a covenant-based architecture. Every agent action is bound by a predefined, cryptographically signed commitment, generating immutable, verifiable receipts upon execution.
                </p>
              </div>
            </div>
          </section>

          <section className="border-b border-[rgba(232,230,224,0.1)] p-10 md:p-20">
            <div className="mb-20 max-w-3xl">
              <h2 className="mb-6 text-4xl font-light tracking-tight text-[#E8E6E0] md:text-5xl">Architecture of Accountability</h2>
              <p className="text-lg font-light text-[#888880]">A full-stack protocol for deterministic accountability in non-deterministic systems.</p>
            </div>

            <div className="grid grid-cols-1 gap-x-12 gap-y-20 md:grid-cols-3">
              {[
                {
                  num: "01",
                  label: "Identity",
                  title: "Agent DIDs",
                  desc: "Agents are issued Decentralized Identifiers (DIDs). Reputation, permissions, and past execution receipts are cryptographically bound to this identity, ensuring persistent, cross-platform accountability."
                },
                {
                  num: "02",
                  label: "Commitment",
                  title: "Smart Covenants",
                  desc: "Before execution, agents lock conditions into a Computable Covenant—a digital contract defining explicit constraints, allowed resource expenditure, and expected deterministic outputs."
                },
                {
                  num: "03",
                  label: "Execution",
                  title: "Immutable Receipts",
                  desc: "During action, agents generate cryptographic proofs of their decision trees and external API interactions. These are hashed and logged to a decentralized, append-only ledger."
                },
                {
                  num: "04",
                  label: "Verification",
                  title: "Zero-Knowledge Proofs",
                  desc: "Anyone can run the TrustCommit Verifier against a receipt to deterministically prove that an agent adhered to its original covenant, without exposing sensitive operational data."
                },
                {
                  num: "05",
                  label: "Resolution",
                  title: "Automated Dispute",
                  desc: "Built-in slasher mechanisms and optimistic rollups allow for automated penalization and state reversion if an agent's receipt fails cryptographic verification against its signed covenant."
                }
              ].map((item) => {
                const featured = item.num === "02" || item.num === "04";
                return (
                <div key={item.num} className={`group ${featured ? "md:-mt-6" : ""}`}>
                  <div className={`mb-6 flex justify-between border-b pb-4 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest ${featured ? "border-[rgba(232,230,224,0.28)] text-[#E8E6E0]" : "border-[rgba(232,230,224,0.1)] text-[#888880]"}`}>
                    <span>{item.num}</span>
                    <span>{item.label}</span>
                  </div>
                  <h3 className={`mb-4 text-2xl font-light transition-colors group-hover:text-white ${featured ? "text-white md:text-[2rem]" : "text-[#E8E6E0]"}`}>{item.title}</h3>
                  <p className={`text-[0.95rem] font-light leading-relaxed ${featured ? "text-[#b6b2a9]" : "text-[#888880]"}`}>{item.desc}</p>
                </div>
              )})}

              <Link
                to="/console"
                className="group relative flex min-h-[200px] flex-col items-center justify-center overflow-hidden border border-[rgba(232,230,224,0.1)] transition-colors duration-300 hover:border-[rgba(232,230,224,0.3)]"
              >
                <div className="absolute inset-0 translate-y-full bg-[rgba(255,255,255,0.05)] transition-transform duration-500 ease-out group-hover:translate-y-0" />
                <span className="relative z-10 flex items-center gap-2 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#E8E6E0]">
                  Open Live Console <span className="font-sans text-lg">→</span>
                </span>
              </Link>
            </div>

            <div className="mt-20 grid grid-cols-1 gap-8 border-t border-[rgba(232,230,224,0.1)] pt-8 md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#888880]">Operational Surface</div>
                <p className="mt-4 max-w-md text-[0.95rem] font-light leading-relaxed text-[#b6b2a9]">
                  The console exposes the live side of the protocol: active covenants, execution traces, evidence packs, verifier state, receipt chains, and dispute lanes.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-[0.22em] text-[#E8E6E0] md:grid-cols-4">
                <div className="border-t border-[rgba(232,230,224,0.16)] pt-3">Covenants</div>
                <div className="border-t border-[rgba(232,230,224,0.16)] pt-3">Evidence Packs</div>
                <div className="border-t border-[rgba(232,230,224,0.16)] pt-3">Receipt Chain</div>
                <div className="border-t border-[rgba(232,230,224,0.16)] pt-3">Dispute Lane</div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2">
            <div className="flex flex-col justify-center border-b border-[rgba(232,230,224,0.1)] p-10 md:border-b-0 md:border-r md:border-[rgba(232,230,224,0.1)] md:p-20">
              <h2 className="mb-5 text-4xl font-light tracking-tight text-[#E8E6E0] md:text-5xl">Agents should not be trusted by vibes.</h2>
              <p className="mb-10 max-w-xl text-[0.95rem] font-light leading-relaxed text-[#888880]">
                Open the accountability layer and inspect how TrustCommit turns execution into commitments, proofs, receipts, and consequences.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  to="/console"
                  className="w-fit bg-[#E8E6E0] px-8 py-4 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#0A0A0A] transition-colors duration-300 hover:bg-white"
                >
                  Open Accountability Layer
                </Link>
                <a
                  href="https://github.com/Ser4nu11EN7/TrustCommit"
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit border border-[rgba(232,230,224,0.1)] px-8 py-4 font-['Fragment_Mono'] text-[0.68rem] uppercase tracking-widest text-[#E8E6E0] transition-colors duration-300 hover:border-[rgba(232,230,224,0.3)]"
                >
                  Read the Protocol
                </a>
              </div>
            </div>

            <div className="flex flex-col justify-end gap-4 bg-[#080808] p-10 text-right font-['Fragment_Mono'] text-[0.65rem] text-[#888880] md:p-20">
              <div className="mb-8 flex justify-end gap-6">
                <a href="#" className="transition-colors hover:text-[#E8E6E0]">Twitter</a>
                <a href="#" className="transition-colors hover:text-[#E8E6E0]">Discord</a>
                <a href="#" className="transition-colors hover:text-[#E8E6E0]">Blog</a>
              </div>
              <p>© 2024 TrustCommit Network.</p>
              <p>Cryptography by design. Accountability by default.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
