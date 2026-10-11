const { createCanvas, loadImage } = require("canvas");
const fs = require("fs-extra");
const path = require("path");

/* ══════════════════════════════════════════════════════════════
   🎯 TEMPLATE
   ══════════════════════════════════════════════════════════════ */
const TEMPLATE_URL = "https://files.catbox.moe/9qknrw.jpg";

/* ─────────────────────────────────────────────────────────────
   🎨 POSITION RATIOS
   ───────────────────────────────────────────────────────────── */
const RATIOS = {
  fredTop:      { x: 0.800, y: 0.155, size: 0.185 },
  revealedFace: { x: 0.222, y: 0.692, size: 0.240 },
  fredBottom:   { x: 0.800, y: 0.660, size: 0.185 }
};

/* ══════════════════════════════════════════════════════════════
   🖼️ Avatar loader — EXACT pair.js style
   ─────────────────────────────────────────────────────────────
   pair.js যেভাবে করে:
   1. সরাসরি loadImage(url) call করে (axios লাগে না)
   2. Multiple URL try করে
   3. Size ≥ 80 হলেই accept করে
   ══════════════════════════════════════════════════════════════ */
async function loadAvatar(uid) {
  const urls = [
    `https://graph.facebook.com/${uid}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    `https://graph.facebook.com/${uid}/picture?type=large&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    `https://graph.facebook.com/${uid}/picture?width=512&height=512`,
    `https://graph.facebook.com/${uid}/picture?type=large`
  ];
  for (const url of urls) {
    try {
      const img = await loadImage(url);
      if (img && img.width >= 80) return img;
    } catch (e) {}
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   🎨 Circular avatar compositor
   ══════════════════════════════════════════════════════════════ */
function drawCircleAvatar(ctx, img, pos, W, H) {
  const size = Math.floor(W * pos.size);
  const cx = Math.floor(W * pos.x);
  const cy = Math.floor(H * pos.y);
  const x = cx - size / 2;
  const y = cy - size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════
   🚀 COMMAND
   ══════════════════════════════════════════════════════════════ */
module.exports = {
  config: {
    name: "chor",
    version: "1.0.2",
    author: "JABED",
    countDown: 5,
    role: 0,
    shortDescription: { en: "Scooby-Doo arrest meme (pair.js style)" },
    longDescription: { en: "Only uses Facebook's built-in avatar API — no third-party service." },
    category: "fun",
    guide: { en: "{pn} [@mention | reply | UID]" }
  },

  langs: {
    en: {
      noTarget: "Please reply or mention someone (not yourself)...... 😅",
      success: "এই দেখ 🕵️‍♂️ @%1 কে হাতে নাতে ধরলাম!\nহালা মুরগী চোর পালাবি কই 😹",
      error: "❌ Error: %1"
    }
  },

  onStart: async function ({ event, args, Users, message, getLang }) {
    const { senderID, mentions, messageReply } = event;

    /* ─── Target detect ─── */
    let targetID = null;
    if (messageReply && messageReply.senderID) {
      targetID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
      const ids = Object.keys(mentions).filter(id => String(id) !== String(senderID));
      if (ids.length > 0) targetID = ids[0];
    } else if (args && args[0] && /^\d{5,}$/.test(args[0])) {
      targetID = args[0];
    }

    if (!targetID || String(targetID) === String(senderID)) {
      return message.reply(getLang("noTarget"));
    }

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const outPath = path.join(cacheDir, `arrest_${senderID}_${targetID}_${Date.now()}.png`);

    try {
      /* ─── Load everything in parallel ─── */
      const [baseImg, senderAvatar, targetAvatar] = await Promise.all([
        loadImage(TEMPLATE_URL),
        loadAvatar(senderID),
        loadAvatar(targetID)
      ]);

      if (!senderAvatar) throw new Error("Sender avatar load failed");
      if (!targetAvatar) throw new Error("Target avatar load failed");

      const W = baseImg.width;
      const H = baseImg.height;
      console.log(`[arrest] Template: ${W}x${H}`);

      /* ─── Composite ─── */
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(baseImg, 0, 0, W, H);

      drawCircleAvatar(ctx, senderAvatar, RATIOS.fredTop, W, H);
      drawCircleAvatar(ctx, targetAvatar, RATIOS.revealedFace, W, H);
      drawCircleAvatar(ctx, senderAvatar, RATIOS.fredBottom, W, H);

      /* ─── Save ─── */
      fs.writeFileSync(outPath, canvas.toBuffer("image/png"));

      /* ─── Send ─── */
      let tag = targetID;
      try {
        tag = (await Users.getNameUser(targetID)) || targetID;
      } catch (_) {}

      return message.reply(
        {
          body: getLang("success", tag),
          attachment: fs.createReadStream(outPath)
        },
        () => { try { fs.unlinkSync(outPath); } catch (_) {} }
      );

    } catch (e) {
      console.error("[arrest] Error:", e);
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
      return message.reply(getLang("error", e.message || "Unknown"));
    }
  }
};
