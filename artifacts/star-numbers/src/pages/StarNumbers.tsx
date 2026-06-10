import { useRef, useState, useCallback } from "react";

type Status = "idle" | "loading" | "done" | "error";

interface FractionBox {
  text: string;
  x: number; y: number; w: number; h: number;
}

interface PixelBox {
  x: number; y: number; w: number; h: number;
  digitCount: number;
  bgColor: string;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const spikes = 5;
  const inner = r * 0.42;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r); rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 2;
  ctx.fill();
  ctx.restore();
}

const PALETTE = [
  { label: "عشوائي", value: "random", colors: ["#ffe066","#c084fc","#f472b6","#67e8f9","#fbbf24","#818cf8"] },
  { label: "أحمر",   value: "#ef4444", colors: ["#ef4444"] },
  { label: "أصفر",  value: "#fbbf24", colors: ["#fbbf24"] },
  { label: "أزرق",   value: "#60a5fa", colors: ["#60a5fa"] },
  { label: "أبيض",   value: "#ffffff", colors: ["#ffffff"] },
  { label: "أسود",   value: "#1a1a1a", colors: ["#1a1a1a"] },
];

function sampleBgColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const sx = Math.max(0, Math.round(x));
  const sy = Math.max(0, Math.round(y));
  const sw = Math.min(Math.max(1, Math.round(w)), cw - sx);
  const sh = Math.min(Math.max(1, Math.round(h)), ch - sy);
  if (sw <= 0 || sh <= 0) return "rgb(12,8,28)";
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
}

function sampleBgFromData(imageData: ImageData, x: number, y: number, size: number): string {
  const W = imageData.width, H = imageData.height;
  const sx = Math.max(0, Math.round(x - size / 2));
  const sy = Math.max(0, Math.round(y - size / 2));
  const ex = Math.min(W, Math.round(x + size / 2));
  const ey = Math.min(H, Math.round(y + size / 2));
  let r = 0, g = 0, b = 0, count = 0;
  for (let row = sy; row < ey; row++) {
    for (let col = sx; col < ex; col++) {
      const i = (row * W + col) * 4;
      r += imageData.data[i]; g += imageData.data[i + 1]; b += imageData.data[i + 2]; count++;
    }
  }
  if (count === 0) return "rgb(12,8,28)";
  return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
}

function paintBoxes(canvas: HTMLCanvasElement, boxes: PixelBox[], starColor: string) {
  const ctx = canvas.getContext("2d")!;
  const rng = (seed: number) => { const v = Math.sin(seed + 1) * 99999; return v - Math.floor(v); };
  const randomColors = ["#ffe066","#c084fc","#f472b6","#67e8f9","#fbbf24","#818cf8","#fb923c"];
  for (const { x, y, w, h, digitCount, bgColor } of boxes) {
    const pad = Math.max(3, Math.min(w, h) * 0.15);
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 4);
    else ctx.rect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.fill();
    ctx.restore();

    const count = Math.max(1, digitCount);
    const r = Math.max(3, Math.min(h * 0.45, w / count / 2.2));
    const cy = y + h / 2;
    for (let i = 0; i < count; i++) {
      const seed = x * 37 + y * 19 + i * 113;
      const cx = x + (w / count) * (i + 0.5);
      const color = starColor === "random"
        ? randomColors[Math.floor(rng(seed) * randomColors.length)]
        : starColor;
      drawStar(ctx, cx, cy, r, color);
    }
  }
}

export default function StarNumbers() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [activeBoxes, setActiveBoxes] = useState<PixelBox[]>([]);
  const [starColor, setStarColor] = useState("random");
  const [penMode, setPenMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalDataRef = useRef<ImageData | null>(null);
  const starColorRef = useRef("random");
  const isPainting = useRef(false);
  const lastPenPos = useRef<{ x: number; y: number } | null>(null);

  const redrawAndUpdate = useCallback((boxes: PixelBox[], color?: string) => {
    const canvas = workCanvasRef.current;
    if (!canvas || !originalDataRef.current) return;
    canvas.getContext("2d")!.putImageData(originalDataRef.current, 0, 0);
    paintBoxes(canvas, boxes, color ?? starColorRef.current);
    setResultUrl(canvas.toDataURL("image/png"));
  }, []);

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const canvas = workCanvasRef.current;
    if (!canvas) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const addPenStar = useCallback((canvasX: number, canvasY: number) => {
    const canvas = workCanvasRef.current;
    const original = originalDataRef.current;
    if (!canvas || !original) return;
    const size = Math.max(20, canvas.height * 0.025);
    const newBox: PixelBox = {
      x: Math.round(canvasX - size / 2),
      y: Math.round(canvasY - size / 2),
      w: Math.round(size),
      h: Math.round(size * 0.6),
      digitCount: 1,
      bgColor: sampleBgFromData(original, canvasX, canvasY, size),
    };
    setActiveBoxes(prev => {
      const next = [...prev, newBox];
      setTimeout(() => redrawAndUpdate(next), 0);
      return next;
    });
  }, [redrawAndUpdate]);

  const handleImgMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!penMode) return;
    e.preventDefault();
    isPainting.current = true;
    const pos = getCanvasCoords(e);
    if (!pos) return;
    lastPenPos.current = pos;
    addPenStar(pos.x, pos.y);
  }, [penMode, getCanvasCoords, addPenStar]);

  const handleImgMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!penMode || !isPainting.current) return;
    const pos = getCanvasCoords(e);
    if (!pos) return;
    const last = lastPenPos.current;
    const canvas = workCanvasRef.current;
    if (!canvas) return;
    const minDist = Math.max(15, canvas.height * 0.02);
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < minDist) return;
    lastPenPos.current = pos;
    addPenStar(pos.x, pos.y);
  }, [penMode, getCanvasCoords, addPenStar]);

  const handleImgMouseUp = useCallback(() => {
    isPainting.current = false;
  }, []);

  const handleImgClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (penMode) return;
    const pos = getCanvasCoords(e);
    if (!pos) return;
    setActiveBoxes(prev => {
      const idx = prev.findIndex(b => {
        const pad = Math.max(3, Math.min(b.w, b.h) * 0.15);
        return pos.x >= b.x - pad && pos.x <= b.x + b.w + pad && pos.y >= b.y - pad && pos.y <= b.y + b.h + pad;
      });
      if (idx < 0) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setTimeout(() => redrawAndUpdate(next), 0);
      return next;
    });
  }, [penMode, getCanvasCoords, redrawAndUpdate]);

  const processImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setStatus("loading");
    setProgress(0);
    setProgressMsg("جاري تحميل الصورة...");
    setResultUrl(null);
    setActiveBoxes([]);
    originalDataRef.current = null;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = workCanvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

      try {
        setProgressMsg("جاري تحليل الصورة...");
        setProgress(20);

        const tempCanvas = document.createElement("canvas");
        const MAX = 1400;
        const scale = Math.min(1, MAX / Math.max(canvas.width, canvas.height));
        tempCanvas.width = Math.round(canvas.width * scale);
        tempCanvas.height = Math.round(canvas.height * scale);
        tempCanvas.getContext("2d")!.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        const base64 = tempCanvas.toDataURL("image/jpeg", 0.82).split(",")[1];

        setProgress(40);
        setProgressMsg("جاري قراءة الأرقام...");

        const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
        const resp = await fetch(`${apiBase}/api/detect-numbers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: "image/jpeg",
            imageWidth: tempCanvas.width,
            imageHeight: tempCanvas.height,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${resp.status}`);
        }

        const { boxes: fractionBoxes }: { boxes: FractionBox[] } = await resp.json();
        setProgress(80);
        setProgressMsg("جاري رسم النجوم...");

        const pixelBoxes: PixelBox[] = fractionBoxes.map((b) => {
          const px = Math.round(b.x * canvas.width);
          const py = Math.round(b.y * canvas.height);
          const pw = Math.max(10, Math.round(b.w * canvas.width));
          const ph = Math.max(8, Math.round(b.h * canvas.height));
          return {
            x: px, y: py, w: pw, h: ph,
            digitCount: (b.text.match(/\d/g) ?? []).length,
            bgColor: sampleBgColor(ctx, px, py, pw, ph),
          };
        });

        paintBoxes(canvas, pixelBoxes, starColorRef.current);
        setActiveBoxes(pixelBoxes);
        setResultUrl(canvas.toDataURL("image/png"));
        setProgress(100);
        setStatus("done");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    };

    img.onerror = () => setStatus("error");
    img.src = objectUrl;
  }, []);

  const handleColorChange = useCallback((value: string) => {
    starColorRef.current = value;
    setStarColor(value);
    setActiveBoxes(prev => {
      setTimeout(() => redrawAndUpdate(prev, value), 0);
      return prev;
    });
  }, [redrawAndUpdate]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processImage(f); e.target.value = "";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) processImage(f);
  };
  const handleReset = () => {
    setStatus("idle"); setResultUrl(null); setActiveBoxes([]); setProgress(0);
    originalDataRef.current = null;
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col" style={{
      background: "radial-gradient(ellipse at 60% 0%, rgba(120,40,220,0.18) 0%, transparent 60%), radial-gradient(ellipse at 10% 80%, rgba(200,60,180,0.12) 0%, transparent 50%), hsl(248,20%,8%)",
    }}>
      <canvas ref={workCanvasRef} className="hidden" />

      <header className="pt-10 pb-4 text-center px-4">
        <div className="inline-flex items-center gap-3 mb-3">
          <span className="text-4xl">✦</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{
            background: "linear-gradient(135deg, #c084fc 0%, #f472b6 50%, #fbbf24 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>تنجيم الأرقام</h1>
          <span className="text-4xl">✦</span>
        </div>
        <p className="text-muted-foreground text-base md:text-lg max-w-md mx-auto leading-relaxed">
          ارفع صورة تحتوي على أرقام وسنحوّلها إلى نجوم ✨
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-16 gap-8">

        {/* شريط اختيار اللون — يظهر دائماً */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <span className="text-sm text-muted-foreground ml-1">لون النجوم:</span>
          {PALETTE.map((p) => (
            <button
              key={p.value}
              onClick={() => handleColorChange(p.value)}
              title={p.label}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "5px 12px", borderRadius: "20px", fontSize: "13px",
                fontWeight: starColor === p.value ? 700 : 400,
                border: starColor === p.value
                  ? "2px solid #c084fc"
                  : "2px solid transparent",
                background: starColor === p.value
                  ? "rgba(192,132,252,0.18)"
                  : "rgba(255,255,255,0.06)",
                color: "hsl(270,80%,90%)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span style={{
                display: "inline-flex", gap: "2px",
              }}>
                {p.colors.map((c, i) => (
                  <span key={i} style={{
                    display: "inline-block", width: "10px", height: "10px",
                    borderRadius: "50%", background: c,
                    border: c === "#ffffff" || c === "#1a1a1a" ? "1px solid rgba(255,255,255,0.3)" : "none",
                  }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>

        {status === "idle" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-lg mt-4 cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-4 p-12"
            style={{
              borderColor: dragOver ? "hsl(270,80%,65%)" : "hsl(270,30%,30%)",
              background: dragOver ? "rgba(192,132,252,0.08)" : "rgba(255,255,255,0.03)",
              boxShadow: dragOver ? "0 0 30px rgba(192,132,252,0.2)" : "none",
            }}
          >
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{ background: "rgba(192,132,252,0.12)" }}>🌟</div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground mb-1">اسحب الصورة هنا أو اضغط للاختيار</p>
              <p className="text-sm text-muted-foreground">PNG، JPG، WEBP — أي صورة تحتوي على أرقام</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        )}

        {status === "loading" && (
          <div className="w-full max-w-lg mt-4 rounded-2xl p-10 flex flex-col items-center gap-6"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid hsl(270,30%,22%)" }}>
            <div className="relative w-24 h-24">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="absolute text-2xl" style={{
                  top: "50%", left: "50%",
                  transform: `rotate(${i * 60}deg) translateY(-38px) translateX(-50%)`,
                  animation: `twinkle 1.2s ease-in-out ${i * 0.2}s infinite`,
                  display: "inline-block",
                }}>★</span>
              ))}
              <span className="absolute inset-0 flex items-center justify-center text-3xl">🔮</span>
            </div>
            <div className="w-full">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">{progressMsg}</span>
                <span className="text-primary font-medium">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "hsl(270,30%,20%)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #c084fc, #f472b6)",
                  boxShadow: "0 0 8px rgba(192,132,252,0.6)",
                }} />
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="w-full max-w-lg mt-4 rounded-2xl p-8 text-center"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p className="text-xl mb-2">⚠️ حدث خطأ</p>
            <p className="text-muted-foreground mb-4">تعذّر معالجة الصورة، حاول مرة أخرى.</p>
            <button onClick={handleReset} className="px-6 py-2 rounded-lg font-medium"
              style={{ background: "hsl(270,80%,65%)", color: "hsl(248,20%,8%)" }}>
              حاول مجدداً
            </button>
          </div>
        )}

        {status === "done" && resultUrl && (
          <div className="w-full max-w-2xl mt-4 flex flex-col gap-4">
            <div className="rounded-2xl overflow-hidden" style={{
              border: "1px solid hsl(270,30%,22%)",
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 0 40px rgba(192,132,252,0.15)",
            }}>
              <div className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid hsl(270,30%,18%)" }}>
                <span className="text-sm font-medium text-muted-foreground">
                  {penMode ? "✏️ وضع القلم — اضغط أو اسحب لإضافة نجوم" : activeBoxes.length > 0
                    ? `✅ ${activeBoxes.length} — اضغط على نجمة لإزالتها`
                    : "✅ تم — يمكنك تحميل الصورة"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPenMode(p => !p)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{
                      background: penMode ? "hsl(270,80%,65%)" : "hsl(270,30%,22%)",
                      color: penMode ? "hsl(248,20%,8%)" : "hsl(270,80%,85%)",
                      border: penMode ? "none" : "1px solid hsl(270,40%,35%)",
                    }}>
                    ✏️ قلم
                  </button>
                  <a href={resultUrl} download="تنجيم-الأرقام.png"
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: "hsl(270,80%,65%)", color: "hsl(248,20%,8%)" }}>
                    تحميل ⬇
                  </a>
                  <button onClick={handleReset} className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: "hsl(270,30%,22%)", color: "hsl(270,80%,85%)" }}>
                    صورة جديدة
                  </button>
                </div>
              </div>
              <div className="p-4 flex items-center justify-center" style={{
                background: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px",
                minHeight: "200px",
              }}>
                <img
                  src={resultUrl}
                  alt="الصورة بعد التنجيم"
                  onClick={handleImgClick}
                  onMouseDown={handleImgMouseDown}
                  onMouseMove={handleImgMouseMove}
                  onMouseUp={handleImgMouseUp}
                  onMouseLeave={handleImgMouseUp}
                  draggable={false}
                  className="max-w-full max-h-[500px] object-contain rounded-lg select-none"
                  style={{
                    cursor: penMode ? "crosshair" : "pointer",
                    boxShadow: "0 4px 32px rgba(192,132,252,0.25)",
                  }}
                />
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              {penMode
                ? "✦ اضغط أو اسحب على الصورة لإضافة نجوم يدوياً ✦"
                : "✦ اضغط على أي نجمة لإزالتها — أو فعّل القلم لإضافة نجوم ✦"}
            </div>
          </div>
        )}

      </main>

      <footer className="text-center pb-8 text-xs text-muted-foreground opacity-50">
        ✦ تنجيم الأرقام ✦
      </footer>
    </div>
  );
}
