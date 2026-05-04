let sym = "BTCUSDT",
  sname = "BTC",
  tf = "15m",
  ct = "candle";
let cds = [],
  prices = {},
  busy = false;
const ASSETS = [
  { s: "BTCUSDT", n: "BTC" },
  { s: "LUNAUSDT", n: "LUNA" },
  { s: "PEPEUSDT", n: "PEPE" },
  { s: "SOLUSDT", n: "SOL" },
  { s: "TRXUSDT", n: "TRX" },
];

async function fetchKlines(s, t) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${t}&limit=120`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).map((c) => ({
    t: c[0],
    o: +c[1],
    h: +c[2],
    l: +c[3],
    c: +c[4],
    v: +c[5],
  }));
}

async function loadAll() {
  if (busy) return;
  busy = true;
  document.getElementById("rbtn").disabled = true;
  setLd(true, "ЗАГРУЗКА ДАННЫХ...");
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      cache: "no-store",
    });
    const all = await r.json();
    for (const a of ASSETS) {
      const t = all.find((x) => x.symbol === a.s);
      if (!t) continue;
      prices[a.s] = {
        price: +t.lastPrice,
        chg: +t.priceChangePercent,
        vol: +t.quoteVolume,
      };
      const pe = document.getElementById("tp-" + a.s),
        ce = document.getElementById("tc-" + a.s);
      if (pe) pe.textContent = fp(+t.lastPrice);
      if (ce) {
        const c = +t.priceChangePercent;
        ce.textContent = (c >= 0 ? "+" : "") + c.toFixed(2) + "%";
        ce.style.color = c >= 0 ? "var(--green)" : "var(--red)";
      }
    }
    await loadCur();
    document.getElementById("utime").textContent =
      "ОБНОВЛЕНО: " + new Date().toLocaleTimeString("ru-RU");
    document.getElementById("srcbadge").textContent = "BINANCE API ✓";
  } catch (e) {
    showErr("Ошибка: " + e.message);
    console.error(e);
  }
  setLd(false);
  document.getElementById("rbtn").disabled = false;
  busy = false;
}

async function loadCur() {
  setLd(true, "ЗАГРУЗКА " + sname + "...");
  document.getElementById("cerr").innerHTML = "";
  try {
    cds = await fetchKlines(sym, tf);
    if (!cds.length) throw new Error("Нет данных");
    analyse();
    drawChart();
    drawVol();
    setLd(false);
  } catch (e) {
    setLd(false);
    showErr("Ошибка: " + e.message + " (CORS / сеть)");
    console.error(e);
  }
}

function analyse() {
  const cl = cds.map((c) => c.c),
    hi = cds.map((c) => c.h),
    lo = cds.map((c) => c.l);
  const price = cl[cl.length - 1];
  const rsi = calcRSI(cl),
    { macd, sig, hist } = calcMACD(cl);
  const e20 = calcEMA(cl, 20),
    e50 = calcEMA(cl, 50),
    bb = calcBB(cl);
  const lvls = calcSR(hi, lo, cl),
    pat = detectPat(cds),
    trend = calcTrend(cl, e20, e50);
  updInds(rsi, macd, sig, hist, e20, e50, bb, price);
  updPrice(price);
  updSR(lvls, price);
  updTrend(trend);
  updPat(pat);
  genSig(price, rsi, macd, sig, hist, e20, e50, bb, trend, lvls, pat);
  runAI(price, rsi, macd, sig, hist, e20, e50, bb, trend, pat);
}

function calcRSI(cl, p = 14) {
  if (cl.length < p + 1) return 50;
  let g = 0,
    l = 0;
  for (let i = 1; i <= p; i++) {
    const d = cl[i] - cl[i - 1];
    d > 0 ? (g += d) : (l -= d);
  }
  let ag = g / p,
    al = l / p;
  for (let i = p + 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function calcEMA(cl, p) {
  if (cl.length < p) return cl[cl.length - 1];
  const k = 2 / (p + 1);
  let e = cl.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < cl.length; i++) e = cl[i] * k + e * (1 - k);
  return e;
}

function calcEMAArr(cl, p) {
  const k = 2 / (p + 1);
  let e = cl[0];
  return cl.map((c) => {
    e = c * k + e * (1 - k);
    return e;
  });
}

function calcMACD(cl) {
  const e12 = calcEMAArr(cl, 12),
    e26 = calcEMAArr(cl, 26);
  const mArr = e12.map((v, i) => v - e26[i]),
    sArr = calcEMAArr(mArr, 9);
  const macd = mArr[mArr.length - 1],
    sig = sArr[sArr.length - 1];
  return { macd, sig, hist: macd - sig };
}

function calcBB(cl, p = 20, d = 2) {
  const sl = cl.slice(-p),
    m = sl.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / p);
  return { upper: m + d * std, middle: m, lower: m - d * std };
}

function calcSR(hi, lo, cl) {
  const price = cl[cl.length - 1],
    w = 5,
    lvls = [];
  for (let i = w; i < hi.length - w; i++) {
    let rH = true,
      rL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (hi[j] >= hi[i]) rH = false;
      if (lo[j] <= lo[i]) rL = false;
    }
    if (rH) lvls.push({ p: hi[i], t: "res" });
    if (rL) lvls.push({ p: lo[i], t: "sup" });
  }
  lvls.sort((a, b) => a.p - b.p);
  const cl2 = [];
  for (const lv of lvls) {
    const last = cl2[cl2.length - 1];
    if (last && Math.abs(last.p - lv.p) / price < 0.007) {
      last.p = (last.p + lv.p) / 2;
      last.str = (last.str || 1) + 1;
    } else cl2.push({ ...lv, str: 1 });
  }
  return cl2
    .filter((l) => Math.abs(l.p - price) / price < 0.12)
    .sort((a, b) => Math.abs(a.p - price) - Math.abs(b.p - price))
    .slice(0, 6);
}

function calcATR() {
  if (cds.length < 14) return 0.02;
  const trs = cds
    .slice(-14)
    .map((c, i, a) =>
      i === 0
        ? c.h - c.l
        : Math.max(
            c.h - c.l,
            Math.abs(c.h - a[i - 1].c),
            Math.abs(c.l - a[i - 1].c),
          ),
    );
  return trs.reduce((a, b) => a + b, 0) / trs.length / cds[cds.length - 1].c;
}

function calcTrend(cl, e20, e50) {
  const price = cl[cl.length - 1],
    half = cl.slice(-10);
  const slope = (half[half.length - 1] - half[0]) / half[0];
  let dir, str;
  if (e20 > e50 && price > e20 && slope > 0.007) {
    dir = "up";
    str = Math.min(5, 2 + Math.round(slope * 150));
  } else if (e20 < e50 && price < e20 && slope < -0.007) {
    dir = "down";
    str = Math.min(5, 2 + Math.round(Math.abs(slope) * 150));
  } else {
    dir = "side";
    str = Math.max(1, 3 - Math.round(Math.abs(slope) * 80));
  }
  return { dir, str };
}

function detectPat(cds) {
  if (cds.length < 20)
    return {
      n: "◎ КОНСОЛИДАЦИЯ",
      t: "neutral",
      d: "Недостаточно данных.",
      pt: "cons",
    };
  const prior = cds.slice(-20, -5),
    last5 = cds.slice(-5);
  const pR =
    Math.max(...prior.map((c) => c.h)) - Math.min(...prior.map((c) => c.l));
  const cR =
    Math.max(...last5.map((c) => c.h)) - Math.min(...last5.map((c) => c.l));
  const pole = prior[prior.length - 1];
  const bU = (pole.c - pole.o) / pole.o,
    bD = (pole.o - pole.c) / pole.o;
  if (bU > 0.025 && cR < pR * 0.45)
    return {
      n: "🚀 БЫЧИЙ ВЫМПЕЛ",
      t: "bull",
      d: "Сильный рост → сжатие. Ожидается продолжение вверх.",
      pt: "pb",
    };
  if (bD > 0.025 && cR < pR * 0.45)
    return {
      n: "🔻 МЕДВЕЖИЙ ВЫМПЕЛ",
      t: "bear",
      d: "Сильное падение → сжатие. Ожидается продолжение вниз.",
      pt: "pm",
    };
  const c5 = last5.map((c) => c.c),
    fD = (c5[c5.length - 1] - c5[0]) / c5[0];
  if (bU > 0.02 && fD > -0.015 && fD < 0)
    return {
      n: "🏳️ БЫЧИЙ ФЛАГ",
      t: "bull",
      d: "Откат после импульса. Продолжение роста.",
      pt: "fb",
    };
  const l20 = cds.slice(-20).map((c) => c.l),
    m1 = Math.min(...l20),
    idx = l20.indexOf(m1);
  const tmp = [...l20];
  tmp[idx] = Infinity;
  const m2 = Math.min(...tmp);
  if (Math.abs(m1 - m2) / m1 < 0.012 && idx < 15)
    return {
      n: "🔵 ДВОЙНОЕ ДНО",
      t: "bull",
      d: "Двойной тест поддержки. Разворот вверх.",
      pt: "db",
    };
  const mom =
    (cds[cds.length - 1].c - cds[cds.length - 6].c) / cds[cds.length - 6].c;
  if (mom > 0.03)
    return {
      n: "📈 БЫЧИЙ ИМПУЛЬС",
      t: "bull",
      d: "Сильное движение вверх.",
      pt: "iu",
    };
  if (mom < -0.03)
    return {
      n: "📉 МЕДВЕЖИЙ ИМПУЛЬС",
      t: "bear",
      d: "Сильное движение вниз.",
      pt: "id",
    };
  return {
    n: "◎ КОНСОЛИДАЦИЯ",
    t: "neutral",
    d: "Боковое движение. Ожидание пробоя.",
    pt: "cons",
  };
}

function genSig(price, rsi, macd, msig, hist, e20, e50, bb, trend, lvls, pat) {
  let score = 0,
    rs = [];
  if (rsi < 30) {
    score += 2.5;
    rs.push("RSI " + rsi.toFixed(1) + " — ПЕРЕПРОДАННОСТЬ → ПОКУПКА");
  } else if (rsi > 70) {
    score -= 2.5;
    rs.push("RSI " + rsi.toFixed(1) + " — ПЕРЕКУПЛЕННОСТЬ → ПРОДАЖА");
  } else if (rsi > 50) {
    score += 0.5;
    rs.push("RSI " + rsi.toFixed(1) + " — бычья зона");
  }
  if (hist > 0) {
    score += 1.5;
    rs.push("MACD > сигнала — бычий импульс");
  } else {
    score -= 1.5;
    rs.push("MACD < сигнала — медвежий импульс");
  }
  if (e20 > e50) {
    score += 1;
    rs.push("EMA20 > EMA50 — бычье пересечение");
  } else {
    score -= 1;
    rs.push("EMA20 < EMA50 — медвежье пересечение");
  }
  if (price > e20) score += 0.5;
  else score -= 0.5;
  if (price < bb.lower) {
    score += 1.5;
    rs.push("Цена ниже BB — зона покупки");
  } else if (price > bb.upper) {
    score -= 1.5;
    rs.push("Цена выше BB — зона продажи");
  }
  if (trend.dir === "up") {
    score += 1;
    rs.push("Тренд ВОСХОДЯЩИЙ (" + trend.str + "/5)");
  } else if (trend.dir === "down") {
    score -= 1;
    rs.push("Тренд НИСХОДЯЩИЙ (" + trend.str + "/5)");
  }
  if (pat.t === "bull") {
    score += 2;
    rs.push(
      "Паттерн: " + pat.n.replace(/[🚀🏳️📈🔵◎🔻📉]/g, "").trim() + " → ПОКУПКА",
    );
  } else if (pat.t === "bear") {
    score -= 2;
    rs.push(
      "Паттерн: " + pat.n.replace(/[🚀🏳️📈🔵◎🔻📉]/g, "").trim() + " → ПРОДАЖА",
    );
  }
  const ns = lvls.find(
    (l) => l.t === "sup" && Math.abs(l.p - price) / price < 0.018,
  );
  const nr = lvls.find(
    (l) => l.t === "res" && Math.abs(l.p - price) / price < 0.018,
  );
  if (ns) {
    score += 1;
    rs.push("Цена у поддержки $" + fp(ns.p));
  }
  if (nr) {
    score -= 1;
    rs.push("Цена у сопротивления $" + fp(nr.p));
  }
  let sT, sc, sg, conf;
  if (score >= 4.5) {
    sT = "ПОКУПКА";
    sc = "var(--green)";
    sg = "rgba(0,255,136,.28)";
    conf = Math.min(93, 58 + score * 4);
  } else if (score >= 2) {
    sT = "СЛАБАЯ ↑";
    sc = "#00cc77";
    sg = "rgba(0,200,100,.18)";
    conf = Math.min(73, 44 + score * 5);
  } else if (score <= -4.5) {
    sT = "ПРОДАЖА";
    sc = "var(--red)";
    sg = "rgba(255,59,92,.28)";
    conf = Math.min(93, 58 + Math.abs(score) * 4);
  } else if (score <= -2) {
    sT = "СЛАБАЯ ↓";
    sc = "#cc3366";
    sg = "rgba(200,50,80,.18)";
    conf = Math.min(73, 44 + Math.abs(score) * 5);
  } else {
    sT = "ОЖИДАНИЕ";
    sc = "var(--orange)";
    sg = "rgba(255,170,0,.18)";
    conf = 38 + Math.abs(score) * 3;
  }
  const ms = document.getElementById("msig");
  ms.style.setProperty("--sc", sc);
  ms.style.setProperty("--sg", sg);
  const stEl = document.getElementById("stype");
  stEl.textContent = sT;
  stEl.style.color = sc;
  const scEl = document.getElementById("sconf");
  scEl.textContent = "УВЕРЕННОСТЬ: " + Math.round(conf) + "%";
  scEl.style.color = sc;
  const ul = document.getElementById("srs");
  ul.innerHTML = "";
  ul.style.setProperty("--sc", sc);
  rs.slice(0, 6).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  });
  calcTPSL(price, score, lvls);
}

function calcTPSL(price, score, lvls) {
  const isL = score > 0,
    atr = calcATR();
  const sups = lvls
    .filter((l) => l.t === "sup" && l.p < price)
    .sort((a, b) => b.p - a.p);
  const ress = lvls
    .filter((l) => l.t === "res" && l.p > price)
    .sort((a, b) => a.p - b.p);
  let sl, tp1, tp2, tp3;
  if (isL) {
    sl = sups[0]?.p || price * (1 - atr * 2.2);
    tp1 = ress[0]?.p || price * (1 + atr * 2);
    tp2 = ress[1]?.p || price * (1 + atr * 4);
    tp3 = price * (1 + atr * 7);
  } else {
    sl = ress[0]?.p || price * (1 + atr * 2.2);
    tp1 = sups[0]?.p || price * (1 - atr * 2);
    tp2 = sups[1]?.p || price * (1 - atr * 4);
    tp3 = price * (1 - atr * 7);
  }
  const pp = (p) => (((p - price) / price) * 100).toFixed(2) + "%";
  ["tp1", "tp2", "tp3"].forEach((id, i) => {
    const v = [tp1, tp2, tp3][i];
    document.getElementById(id).textContent = "$" + fp(v);
    document.getElementById(id + "p").textContent = pp(v);
  });
  document.getElementById("sl1").textContent = "$" + fp(sl);
  document.getElementById("sl1p").textContent = pp(sl);
  document.getElementById("rr").textContent =
    "1 : " + (Math.abs(tp1 - price) / Math.abs(sl - price)).toFixed(2);
}

function updInds(rsi, macd, msig, hist, e20, e50, bb, price) {
  const rEl = document.getElementById("rsiV");
  rEl.textContent = rsi.toFixed(1);
  rEl.style.setProperty(
    "--ivv",
    rsi < 30 ? "var(--green)" : rsi > 70 ? "var(--red)" : "var(--text)",
  );
  const rf = document.getElementById("rfill");
  rf.style.width = rsi + "%";
  rf.style.background =
    rsi < 30 ? "var(--green)" : rsi > 70 ? "var(--red)" : "var(--orange)";
  document.getElementById("rsiZ").textContent =
    rsi < 30
      ? " ▲ ПЕРЕПРОДАННОСТЬ "
      : rsi > 70
        ? " ▼ ПЕРЕКУПЛЕННОСТЬ "
        : "→ НЕЙТРАЛЬНО";
  document.getElementById("macdV").textContent = fp(macd);
  document.getElementById("macdS").textContent = "SIG: " + fp(msig);
  const hEl = document.getElementById("macdH");
  hEl.textContent = "HIST: " + (hist > 0 ? "+" : "") + fp(hist);
  hEl.style.color = hist > 0 ? "var(--green)" : "var(--red)";
  document.getElementById("ema20V").textContent = "EMA20: $" + fp(e20);
  document.getElementById("ema50V").textContent = "EMA50: $" + fp(e50);
  const cr = e20 > e50,
    cEl = document.getElementById("emaCr");
  cEl.textContent = cr ? " ▲ БЫЧЬЕ ПЕРЕСЕЧЕНИЕ" : " ▼ МЕДВЕЖЬЕ ПЕРЕСЕЧЕНИЕ";
  cEl.style.color = cr ? "var(--green)" : "var(--red)";
  document.getElementById("bbU").textContent = "↑ $" + fp(bb.upper);
  document.getElementById("bbM").textContent = "MA: $" + fp(bb.middle);
  const lEl = document.getElementById("bbL");
  lEl.textContent = "↓ $" + fp(bb.lower);
  lEl.style.color =
    price < bb.lower
      ? "var(--green)"
      : price > bb.upper
        ? "var(--red)"
        : "var(--text)";
}

function updPrice(price) {
  document.getElementById("curP").textContent = "$" + fp(price);
  const info = prices[sym];
  if (info) {
    const c = info.chg,
      cEl = document.getElementById("chg24");
    cEl.textContent = (c >= 0 ? "+" : "") + c.toFixed(2) + "%";
    cEl.style.color = c >= 0 ? "var(--green)" : "var(--red)";
    document.getElementById("vol24").textContent = "$" + fvol(info.vol);
  }
}

function updSR(lvls, price) {
  document.getElementById("srcnt").textContent = lvls.length + " УРОВНЕЙ";
  const g = document.getElementById("srgrid");
  g.innerHTML = "";
  if (!lvls.length) {
    g.innerHTML =
      '<div style="color:var(--dim);font-size:9px;grid-column:span 2">Недостаточно данных для уровней</div>';
    return;
  }
  lvls.forEach((l) => {
    const isR = l.t === "res",
      dist = (((l.p - price) / price) * 100).toFixed(2);
    const d = document.createElement("div");
    d.className = "srcard";
    d.innerHTML = `<div class="srt" style="color:${isR ? "var(--red)" : "var(--green)"}">${isR ? "⬆️ СОПРОТИВЛЕНИЕ" : "⬇️ ПОДДЕРЖКА"}</div><div class="srp" style="color:${isR ? "var(--red)" : "var(--green)"}">$${fp(l.p)}</div><div class="srd">${dist > 0 ? "+" : ""}${dist}% · ${"★".repeat(Math.min(l.str, 3))}${"☆".repeat(3 - Math.min(l.str, 3))}</div>`;
    g.appendChild(d);
  });
}

function updTrend(trend) {
  const A = { up: "↑", down: "↓", side: "→" },
    N = { up: "ВОСХОДЯЩИЙ", down: "НИСХОДЯЩИЙ", side: "БОКОВОЙ" };
  const C = { up: "var(--green)", down: "var(--red)", side: "var(--orange)" };
  const D = {
    up: "EMA20>EMA50 · цена выше скользящих · бычий тренд",
    down: "EMA20<EMA50 · цена ниже скользящих · медвежий тренд",
    side: "Боковое движение · ожидание пробоя",
  };
  document.getElementById("tarr").textContent = A[trend.dir];
  document.getElementById("tarr").style.color = C[trend.dir];
  document.getElementById("tname").textContent = N[trend.dir];
  document.getElementById("tname").style.color = C[trend.dir];
  document.getElementById("tdesc").textContent = D[trend.dir];
  document.querySelectorAll(".sbr").forEach((b, i) => {
    b.classList.toggle("on", i < trend.str);
    b.style.background = i < trend.str ? C[trend.dir] : "";
  });
  document.getElementById("slbl").textContent = trend.str + "/5";
}

function updPat(pat) {
  const C = {
    bull: "var(--green)",
    bear: "var(--red)",
    neutral: "var(--orange)",
  };
  document.getElementById("pname").textContent = pat.n;
  document.getElementById("pname").style.color = C[pat.t] || "var(--orange)";
  document.getElementById("pdesc").textContent = pat.d;
  drawPat(pat);
}

function drawChart() {
  const cv = document.getElementById("chartCanvas");
  const W = cv.clientWidth || cv.offsetWidth;
  const H = 295;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  const ctx = cv.getContext("2d");
  if (ctx.resetTransform) ctx.resetTransform();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const data = cds.slice(-80);
  if (!data.length) return;
  const pad = { t: 18, r: 72, b: 26, l: 6 },
    cW = W - pad.l - pad.r,
    cH = H - pad.t - pad.b;
  const allP = data.flatMap((c) => [c.h, c.l]),
    minP = Math.min(...allP),
    maxP = Math.max(...allP),
    rng = maxP - minP || 1;
  const toX = (i) => pad.l + (i / (data.length - 1 || 1)) * cW,
    toY = (p) => pad.t + cH - ((p - minP) / rng) * cH;
  ctx.fillStyle = "#06090f";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * cH;
    ctx.strokeStyle = "#1a2535";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = "#3a4a5c";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("$" + fp(maxP - (i / 4) * rng), W - pad.r + 4, y + 3);
  }
  const cl = data.map((c) => c.c);
  [
    [calcEMAArr(cl, 20), "rgba(0,229,255,.55)"],
    [calcEMAArr(cl, 50), "rgba(255,170,0,.4)"],
  ].forEach(([arr, col]) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    arr.forEach((v, i) =>
      i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)),
    );
    ctx.stroke();
  });
  const bbArr = cl.map((_, i) => {
    if (i < 19) return null;
    return calcBB(cl.slice(i - 19, i + 1));
  });
  ctx.strokeStyle = "rgba(155,89,182,.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ["upper", "lower"].forEach((k) => {
    ctx.beginPath();
    let f = true;
    bbArr.forEach((bb, i) => {
      if (!bb) return;
      const x = toX(i),
        y = toY(bb[k]);
      f ? (ctx.moveTo(x, y), (f = false)) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  {
    const lvls = calcSR(
      data.map((c) => c.h),
      data.map((c) => c.l),
      cl,
    );
    lvls.forEach((l) => {
      const y = toY(l.p);
      if (y < pad.t || y > H - pad.b) return;
      ctx.strokeStyle =
        l.t === "res" ? "rgba(255,59,92,.35)" : "rgba(0,255,136,.35)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
  const bw = Math.max(1, (cW / data.length) * 0.65);
  if (ct === "line") {
    ctx.strokeStyle = "var(--accent)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((c, i) =>
      i === 0 ? ctx.moveTo(toX(i), toY(c.c)) : ctx.lineTo(toX(i), toY(c.c)),
    );
    ctx.stroke();
    ctx.fillStyle = "rgba(0,229,255,.06)";
    ctx.lineTo(toX(data.length - 1), H);
    ctx.lineTo(toX(0), H);
    ctx.closePath();
    ctx.fill();
  } else if (ct === "candle") {
    data.forEach((c, i) => {
      const x = toX(i),
        up = c.c >= c.o;
      ctx.strokeStyle = up ? "#00ff88" : "#ff3b5c";
      ctx.fillStyle = up ? "rgba(0,255,136,.75)" : "rgba(255,59,92,.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h));
      ctx.lineTo(x, toY(c.l));
      ctx.stroke();
      const top = toY(Math.max(c.o, c.c)),
        bot = toY(Math.min(c.o, c.c));
      ctx.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
    });
  } else {
    data.forEach((c, i) => {
      const x = toX(i),
        up = c.c >= c.o;
      ctx.strokeStyle = up ? "#00ff88" : "#ff3b5c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h));
      ctx.lineTo(x, toY(c.l));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - bw / 2, toY(c.o));
      ctx.lineTo(x, toY(c.o));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, toY(c.c));
      ctx.lineTo(x + bw / 2, toY(c.c));
      ctx.stroke();
    });
  }
  const cy = toY(cl[cl.length - 1]);
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, cy);
  ctx.lineTo(W - pad.r, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#3a4a5c";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const step = Math.floor(data.length / 5);
  for (let i = 0; i < data.length; i += step) {
    const d = new Date(data[i].t);
    ctx.fillText(
      `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, "0")}h`,
      toX(i),
      H - 5,
    );
  }
}

function drawVol() {
  const cv = document.getElementById("volCanvas");
  const Wv = cv.clientWidth || cv.offsetWidth;
  const Hv = 52;
  const dprV = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(Wv * dprV));
  cv.height = Math.max(1, Math.round(Hv * dprV));
  const ctx = cv.getContext("2d");
  if (ctx.resetTransform) ctx.resetTransform();
  ctx.setTransform(dprV, 0, 0, dprV, 0, 0);
  const data = cds.slice(-80);
  if (!data.length) return;
  ctx.fillStyle = "#06090f";
  ctx.fillRect(0, 0, Wv, Hv);
  const maxV = Math.max(...data.map((c) => c.v)),
    bw = Wv / data.length;
  data.forEach((c, i) => {
    const h = (c.v / maxV) * (Hv - 4),
      up = c.c >= c.o;
    ctx.fillStyle = up ? "rgba(0,255,136,.38)" : "rgba(255,59,92,.35)";
    ctx.fillRect(i * bw + 1, Hv - h - 2, bw - 2, h);
  });
}

function drawPat(pat) {
  const cv = document.getElementById("patCanvas");
  const Wp = cv.clientWidth || cv.offsetWidth;
  const Hp = 52;
  const dprP = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(Wp * dprP));
  cv.height = Math.max(1, Math.round(Hp * dprP));
  const ctx = cv.getContext("2d");
  if (ctx.resetTransform) ctx.resetTransform();
  ctx.setTransform(dprP, 0, 0, dprP, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const m = Hp / 2;
  const pts = {
    pb: [
      [0, Hp * 0.8],
      [Wp * 0.35, 0.12 * Hp],
      [Wp * 0.42, 0.28 * Hp],
      [Wp * 0.52, 0.2 * Hp],
      [Wp * 0.62, 0.32 * Hp],
      [Wp * 0.72, 0.24 * Hp],
      [Wp, 0.06 * Hp],
    ],
    pm: [
      [0, Hp * 0.12],
      [Wp * 0.35, Hp * 0.85],
      [Wp * 0.45, Hp * 0.65],
      [Wp * 0.55, Hp * 0.75],
      [Wp * 0.65, Hp * 0.6],
      [Wp * 0.75, Hp * 0.68],
      [Wp, Hp * 0.9],
    ],
    fb: [
      [0, Hp * 0.8],
      [Wp * 0.3, Hp * 0.1],
      [Wp * 0.36, Hp * 0.24],
      [Wp * 0.5, Hp * 0.3],
      [Wp * 0.65, Hp * 0.2],
      [Wp * 0.7, Hp * 0.34],
      [Wp, Hp * 0.05],
    ],
    db: [
      [0, m * 0.5],
      [Wp * 0.2, m * 1.5],
      [Wp * 0.4, m * 0.8],
      [Wp * 0.6, m * 1.5],
      [Wp * 0.8, m * 0.8],
      [Wp, m * 0.3],
    ],
    iu: [
      [0, Hp * 0.9],
      [Wp * 0.2, Hp * 0.7],
      [Wp * 0.3, Hp * 0.75],
      [Wp * 0.5, Hp * 0.4],
      [Wp * 0.65, Hp * 0.45],
      [Wp * 0.8, Hp * 0.15],
      [Wp, Hp * 0.08],
    ],
    id: [
      [0, Hp * 0.08],
      [Wp * 0.2, Hp * 0.3],
      [Wp * 0.35, Hp * 0.25],
      [Wp * 0.5, Hp * 0.6],
      [Wp * 0.65, Hp * 0.55],
      [Wp * 0.8, Hp * 0.85],
      [Wp, Hp * 0.9],
    ],
    cons: [
      [0, m],
      [Wp * 0.15, m * 0.8],
      [Wp * 0.3, m * 1.2],
      [Wp * 0.45, m * 0.9],
      [Wp * 0.6, m * 1.1],
      [Wp * 0.75, m],
      [Wp, m * 0.95],
    ],
  };
  const C = {
    bull: "var(--green)",
    bear: "var(--red)",
    neutral: "var(--orange)",
  };
  const p = pts[pat.pt] || pts.cons;
  ctx.strokeStyle = C[pat.t] || "var(--orange)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  p.forEach((pt, i) =>
    i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]),
  );
  ctx.stroke();
}

async function runAI(price, rsi, macd, msig, hist, e20, e50, bb, trend, pat) {
  const el = document.getElementById("aitxt");
  el.innerHTML = '<span class="aild">AI АНАЛИЗИРУЕТ...</span>';
  try {
    const dirs = { up: "восходящий", down: "нисходящий", side: "боковой" };
    const prompt = `Ты профессиональный трейдер. Кратко проанализируй ${sname}/USDT, таймфрейм ${tf}.\nДанные: цена $${fp(price)}, RSI ${rsi.toFixed(1)}, MACD ${fp(macd)} (hist ${hist > 0 ? "+" : ""}${fp(hist)}), EMA20 $${fp(e20)} / EMA50 $${fp(e50)}, BB верх $${fp(bb.upper)} / низ $${fp(bb.lower)}, тренд: ${dirs[trend.dir]} (сила ${trend.str}/5), паттерн: ${pat.n}.\nОтвет: 1) Решение (ПОКУПКА/ПРОДАЖА/ОЖИДАНИЕ) 2) 2-3 ключевых аргумента 3) На что смотреть дальше. Макс 80 слов, по-русски.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json();
    el.textContent =
      d.content?.map((b) => b.text || "").join("") || "Ответ не получен.";
  } catch (e) {
    el.textContent =
      "AI-анализ временно недоступен. Используйте индикаторы выше.";
  }
}

function fp(p) {
  if (p === undefined || p === null) return "—";
  const a = Math.abs(p);
  if (a === 0) return "0";
  if (a < 0.000001) return p.toFixed(10);
  if (a < 0.0001) return p.toFixed(8);
  if (a < 0.01) return p.toFixed(6);
  if (a < 1) return p.toFixed(4);
  if (a < 10000)
    return p.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fvol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(0);
}
function showErr(m) {
  document.getElementById("cerr").innerHTML =
    '<div class="errbox">⚠️ ' + m + "</div>";
}
function setLd(show, msg = "") {
  const ld = document.getElementById("loader");
  if (show) {
    ld.style.display = "flex";
    if (msg) document.getElementById("lmsg").textContent = msg;
  } else ld.style.display = "none";
}

function selA(s, n) {
  sym = s;
  sname = n;
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + s).classList.add("active");
  loadCur();
}
function setTF(t) {
  tf = t;
  document
    .querySelectorAll("#tfctrl .cb")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tf-" + t).classList.add("active");
  loadCur();
}
function setCT(t) {
  ct = t;
  document
    .querySelectorAll("#ctctrl .cb")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("ct-" + t).classList.add("active");
  drawChart();
}

window.addEventListener("load", async () => {
  await loadAll();
  setInterval(loadAll, 30000);
  window.addEventListener("resize", () => {
    if (cds.length) {
      drawChart();
      drawVol();
    }
  });
});
