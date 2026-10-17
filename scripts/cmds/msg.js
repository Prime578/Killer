const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const yts = require("yt-search");

// ─── Optional deps ───
let ffmpeg = null;
try {
  ffmpeg = require("fluent-ffmpeg");
  try { const s = require("ffmpeg-static"); if (s) ffmpeg.setFfmpegPath(s); } catch (e) {}
  console.log("[msg] ffmpeg ✅");
} catch (e) { console.log("[msg] ffmpeg ❌", e.message); }

let ytdl = null;
try { ytdl = require("@distube/ytdl-core"); console.log("[msg] ytdl ✅"); }
catch (e) { console.log("[msg] ytdl ❌", e.message); }

let Canvas = null;
try { Canvas = require("canvas"); console.log("[msg] canvas ✅"); }
catch (e) { console.log("[msg] canvas ❌", e.message); }

async function baseApiUrl() {
  const r = await axios.get(
    "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
    { timeout: 10000 }
  );
  return r.data.mahmud;
}

module.exports.config = {
  name: "msg",
  aliases: ["msgsong"],
  version: "16.0",
  author: "JABED",
  countDown: 5,
  role: 0,
  description: "Song with cover image",
  category: "media",
  guide: { en: "{pn} song <name>" }
};

module.exports.onStart = async function ({ api, event, args, message }) {
  console.log("[msg] onStart | args =", JSON.stringify(args));
  try { api.setMessageReaction("🎵", event.messageID, () => {}, true); } catch (e) {}
  if ((args[0] || "").toLowerCase() !== "song" || args.length < 2) {
    return message.reply("📌 Use: .msg song <song name>");
  }
  return sendSong(api, event, message, args.slice(1).join(" ").trim());
};

module.exports.onChat = async function ({ api, event, message }) {
  const m = String(event.body || "").trim().match(/^msg\s+song\s+(.+)$/i);
  if (!m) return;
  console.log("[msg] onChat |", m[1]);
  return sendSong(api, event, message, m[1].trim());
};

// ─── Download audio from multiple sources ───
async function downloadAudio(query, video, destPath) {
  const sources = [
    // Source 1: HINATA /api/singv4
    {
      name: "HINATA singv4",
      fn: async () => {
        const base = await baseApiUrl();
        const url = `${base}/api/singv4?search=${encodeURIComponent(video.title)}&type=audio`;
        console.log("[msg] try:", url);
        const res = await axios.get(url, {
          responseType: "stream", timeout: 90000,
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        return res.data;
      }
    },
    // Source 2: HINATA /api/singv3
    {
      name: "HINATA singv3",
      fn: async () => {
        const base = await baseApiUrl();
        const url = `${base}/api/singv3?search=${encodeURIComponent(video.title)}&type=audio`;
        console.log("[msg] try:", url);
        const res = await axios.get(url, {
          responseType: "stream", timeout: 90000,
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        return res.data;
      }
    },
    // Source 3: HINATA /api/sing (basic)
    {
      name: "HINATA sing",
      fn: async () => {
        const base = await baseApiUrl();
        const url = `${base}/api/sing?search=${encodeURIComponent(video.title)}&type=audio`;
        console.log("[msg] try:", url);
        const res = await axios.get(url, {
          responseType: "stream", timeout: 90000,
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        return res.data;
      }
    },
    // Source 4: Direct YouTube via ytdl-core
    {
      name: "ytdl-core direct",
      fn: async () => {
        if (!ytdl) throw new Error("ytdl not installed");
        const url = `https://www.youtube.com/watch?v=${video.videoId}`;
        console.log("[msg] try ytdl:", url);
        return ytdl(url, {
          filter: "audioonly",
          quality: "lowestaudio",
          highWaterMark: 1 << 25
        });
      }
    }
  ];

  for (const src of sources) {
    try {
      console.log("[msg] --- trying:", src.name);
      const stream = await src.fn();

      // Write to file
      const w = fs.createWriteStream(destPath);
      stream.pipe(w);
      await new Promise((r, j) => {
        w.on("finish", r);
        w.on("error", j);
        stream.on("error", j);
        setTimeout(() => j(new Error("timeout")), 90000);
      });

      const size = fs.statSync(destPath).size;
      console.log(`[msg] ${src.name} → ${size} bytes`);

      if (size > 500000) {
        console.log(`[msg] ✅ ${src.name} SUCCESS (${(size/1024/1024).toFixed(2)} MB)`);
        return { ok: true, source: src.name, size };
      } else {
        console.log(`[msg] ❌ ${src.name} too small`);
        try { fs.unlinkSync(destPath); } catch (e) {}
      }
    } catch (e) {
      console.log(`[msg] ❌ ${src.name} failed: ${e.message}`);
      try { fs.unlinkSync(destPath); } catch (x) {}
    }
  }

  return { ok: false };
}

// ─── Main ───
async function sendSong(api, event, message, query) {
  const { messageID } = event;
  const cacheDir = path.join(__dirname, "cache");
  fs.ensureDirSync(cacheDir);
  const ts = Date.now();
  const audioPath = path.join(cacheDir, `msg_${ts}.mp3`);
  const cardPath = path.join(cacheDir, `msg_${ts}_card.png`);
  const videoPath = path.join(cacheDir, `msg_${ts}.mp4`);

  try {
    // yts search
    console.log("[msg] yts:", query);
    const searchRes = await yts(query);
    const videos = (searchRes.videos || []).slice(0, 5);

    if (!videos.length) {
      api.setMessageReaction("❌", messageID, () => {}, true);
      return message.reply(`❌ "${query}" এর ফলাফল নেই।`);
    }

    const video = videos[0];
    console.log("[msg] picked:", video.title);

    // Multi-source download
    const result = await downloadAudio(query, video, audioPath);
    if (!result.ok) {
      api.setMessageReaction("❌", messageID, () => {}, true);
      return message.reply("❌ সব সোর্সে গান পাওয়া যায়নি, আবার চেষ্টা করুন।");
    }

    // Card render
    let cardOk = false;
    if (Canvas) {
      try {
        await makeCard({
          title: cleanTitle(video.title),
          artist: cleanArtist(video.author && video.author.name),
          id: video.videoId
        }, cardPath);
        cardOk = true;
        console.log("[msg] card ✅");
      } catch (e) { console.log("[msg] card fail:", e.message); }
    }

    // Combine to mp4
    if (cardOk && ffmpeg) {
      try {
        await combineMp4(cardPath, audioPath, videoPath);
        const vSize = fs.statSync(videoPath).size;
        console.log("[msg] mp4:", vSize, "bytes");

        if (vSize > 0 && vSize <= 25 * 1024 * 1024) {
          api.setMessageReaction("✅", messageID, () => {}, true);
          return message.reply({
            body: `🎧 | ${cleanTitle(video.title)}`,
            attachment: fs.createReadStream(videoPath)
          }, () => {
            for (const p of [videoPath, audioPath, cardPath]) {
              try { fs.unlinkSync(p); } catch (e) {}
            }
          });
        }
      } catch (e) {
        console.log("[msg] ffmpeg fail:", e.message);
      }
    }

    // Audio only fallback
    console.log("[msg] audio only");
    api.setMessageReaction("✅", messageID, () => {}, true);
    return message.reply({
      body: `🎧 | ${cleanTitle(video.title)}`,
      attachment: fs.createReadStream(audioPath)
    }, () => {
      for (const p of [audioPath, cardPath]) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    });

  } catch (e) {
    console.log("[msg] ERROR:", e.message);
    for (const p of [audioPath, cardPath, videoPath]) {
      try { fs.unlinkSync(p); } catch (x) {}
    }
    api.setMessageReaction("❌", messageID, () => {}, true);
    return message.reply(`❌ ${e.message}`);
  }
}

function combineMp4(imagePath, audioPath, outPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) return reject(new Error("ffmpeg unavailable"));
    ffmpeg()
      .input(imagePath).inputOptions(["-loop 1"])
      .input(audioPath)
      .outputOptions([
        "-c:v libx264", "-tune stillimage",
        "-c:a aac", "-b:a 128k",
        "-pix_fmt yuv420p", "-shortest",
        "-movflags +faststart", "-r 1"
      ])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

function cleanTitle(t) {
  const c = String(t || "").replace(/\s*[\(\[].*?[\)\]]/g, "")
    .replace(/\b(official|music video|video|lyrics?|audio|hd|4k)\b/gi, "")
    .replace(/\s{2,}/g, " ").trim();
  return c || String(t || "").trim();
}
function cleanArtist(a) {
  return String(a || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
}
function fit(ctx, t, w) {
  if (ctx.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function makeCard({ title, artist, id }, filePath) {
  const { createCanvas, loadImage } = Canvas;
  const load = async (u) => {
    const r = await axios.get(u, { responseType: "arraybuffer", timeout: 20000 });
    return loadImage(Buffer.from(r.data));
  };

  let img, lb = false;
  try { img = await load(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`); }
  catch (_) { img = await load(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`); lb = true; }

  let sx, sy, ss;
  if (lb) {
    ss = Math.round(img.height * 0.75);
    sx = Math.round((img.width - ss) / 2);
    sy = Math.round((img.height - ss) / 2);
  } else {
    ss = Math.min(img.width, img.height);
    sx = Math.round((img.width - ss) / 2);
    sy = Math.round((img.height - ss) / 2);
  }

  const W = 900, H = 560;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a1214");
  bg.addColorStop(1, "#0b0b0d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = 60, cy = 50, cs = 460, dx = 650, dy = 280, dr = 230;

  const disc = ctx.createRadialGradient(dx, dy, 10, dx, dy, dr);
  disc.addColorStop(0, "#3a3a3a");
  disc.addColorStop(0.5, "#141414");
  disc.addColorStop(1, "#050505");
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1.5;
  for (let r = 100; r < dr - 6; r += 9) {
    ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(dx, dy, 78, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, sx, sy, ss, ss, dx - 78, dy - 78, 156, 156);
  ctx.restore();
  ctx.fillStyle = "#0b0b0d";
  ctx.beginPath(); ctx.arc(dx, dy, 9, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 30; ctx.shadowOffsetX = 8;
  rr(ctx, cx, cy, cs, cs, 44);
  ctx.fillStyle = "#000"; ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, cx, cy, cs, cs, 44); ctx.clip();
  ctx.drawImage(img, sx, sy, ss, ss, cx, cy, cs, cs);
  const sh = ctx.createLinearGradient(0, cy + cs * 0.5, 0, cy + cs);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx, cy, cs, cs);
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(cx + 34, cy + 30);
  ctx.lineTo(cx + 34, cy + 74);
  ctx.lineTo(cx + 72, cy + 52);
  ctx.closePath();
  ctx.fill();

  const tw = cs - 60;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(fit(ctx, title, tw), cx + 30, cy + cs - 78);
  ctx.font = "30px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(fit(ctx, artist, tw), cx + 30, cy + cs - 34);

  await fs.writeFile(filePath, cv.toBuffer("image/png"));
}
