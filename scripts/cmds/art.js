const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

/* ══════════════════════════════════════════════════════════════
   🎨 ART — Style apply via Edit API
   ─────────────────────────────────────────────────────────────
   Style API down → edit API দিয়ে প্রতিটা style এর জন্য
   একটা prompt পাঠানো হচ্ছে।
   ══════════════════════════════════════════════════════════════ */
const EDIT_API = "https://xalman-apis.vercel.app/api/edit";

/* ─── Style + Style-specific prompts ─── */
const STYLES = {
  "anime":      { desc: "🎌 Anime / Manga look",       prompt: "convert this image to anime style, japanese animation, manga art, vibrant colors" },
  "cartoon":    { desc: "🎨 Cartoon style",            prompt: "convert this image to cartoon style, animated, colorful, disney pixar style" },
  "sketch":     { desc: "✏️  Pencil sketch",           prompt: "convert this image to pencil sketch style, black and white drawing, detailed line art" },
  "oil":        { desc: "🖼️  Oil painting",            prompt: "convert this image to oil painting style, classical art, textured brush strokes" },
  "watercolor": { desc: "💧 Watercolor painting",      prompt: "convert this image to watercolor painting style, soft pastel colors, artistic" },
  "cyberpunk":  { desc: "🌃 Cyberpunk neon",           prompt: "convert this image to cyberpunk style, neon lights, futuristic, dark aesthetic" },
  "ghibli":     { desc: "🌿 Studio Ghibli",            prompt: "convert this image to studio ghibli anime style, magical, whimsical, hand drawn" },
  "pixel":      { desc: "👾 Pixel art",                prompt: "convert this image to pixel art style, 8-bit, retro video game, blocky" },
  "3d":         { desc: "🧊 3D render",                prompt: "convert this image to 3d render style, octane render, realistic lighting" },
  "comic":      { desc: "📚 Comic book style",         prompt: "convert this image to comic book style, marvel dc art, bold lines, halftone" }
};

const AVAILABLE_STYLES = Object.keys(STYLES);

module.exports = {
  config: {
    name: "art",
    version: "4.0.0",
    author: "JABED",
    countDown: 5,
    role: 0,
    shortDescription: { en: "Apply art style to replied image" },
    longDescription: { en: "Convert replied image to any art style using AI." },
    category: "editing",
    guide: {
      en: "Reply to an image with {pn} [style]\n\n"
        + "Available styles:\n"
        + AVAILABLE_STYLES.map(s => `  • ${s}`).join("\n")
        + "\n\nExample:\n"
        + "  {pn}         → anime (default)\n"
        + "  {pn} ghibli  → ghibli style\n\n"
        + "List all styles:\n"
        + "  {pn} list"
    }
  },

  langs: {
    en: {
      styleList: `🎨 𝗔𝗩𝗔𝗜𝗟𝗔𝗕𝗟𝗘 𝗔𝗥𝗧 𝗦𝗧𝗬𝗟𝗘𝗦\n━━━━━━━━━━━━━━━━━━\n\n%1\n\n━━━━━━━━━━━━━━━━━━\n💡 Usage:\n  Reply to an image with:\n  {pn} <style>\n\nExample:\n  {pn} ghibli`,
      noImage: "❌ Please reply to an image.",
      invalidStyle: "❌ Invalid style \"%1\".\n\nType {pn} list to see all styles.",
      processing: "🎨 Applying %1 style...\n⏳ Please wait, this may take 1-2 minutes.",
      success: "✅ AI artify (%1) applied successfully!",
      error: "❌ Something went wrong. Please try again.",
      timeout: "⏱️ Request timed out. Server took too long."
    }
  },

  onStart: async function ({ event, message, args, getLang }) {
    const { messageReply } = event;
    const prefix = global.GoatBot.config.prefix;
    const firstArg = (args[0] || "").toLowerCase().trim();

    /* ─── `.art list` — show all styles ─── */
    if (firstArg === "list" || firstArg === "-l" || firstArg === "help") {
      const listText = AVAILABLE_STYLES
        .map((s, i) => `${(i + 1).toString().padStart(2, "0")}. ${STYLES[s].desc}  \`${s}\``)
        .join("\n");

      return message.reply(
        getLang("styleList", listText).replace(/{pn}/g, `${prefix}art`)
      );
    }

    /* ─── Reply check ─── */
    if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
      return message.reply(getLang("noImage"));
    }

    /* ─── Style parse ─── */
    const style = firstArg || "anime";

    if (!AVAILABLE_STYLES.includes(style)) {
      return message.reply(
        getLang("invalidStyle", style).replace(/{pn}/g, `${prefix}art`)
      );
    }

    const imageUrl = messageReply.attachments[0].url;
    const stylePrompt = STYLES[style].prompt;

    /* ─── Cache path ─── */
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `art_${style}_${Date.now()}.png`);

    let processingMsg;
    try {
      /* ─── Send "processing" message ─── */
      processingMsg = await message.reply(getLang("processing", style));

      /* ─── Call Edit API with style prompt ─── */
      const encodedImg = encodeURIComponent(imageUrl);
      const encodedPrompt = encodeURIComponent(stylePrompt);
      const apiUrl = `${EDIT_API}?img=${encodedImg}&prompt=${encodedPrompt}`;

      const response = await axios({
        method: "GET",
        url: apiUrl,
        responseType: "arraybuffer",
        timeout: 240000
      });

      const buffer = Buffer.from(response.data);
      fs.writeFileSync(filePath, buffer);

      /* ─── Delete processing msg ─── */
      if (processingMsg?.messageID) {
        try { await message.unsend(processingMsg.messageID); } catch (_) {}
      }

      /* ─── Send result ─── */
      return message.reply(
        {
          body: getLang("success", style),
          attachment: fs.createReadStream(filePath)
        },
        () => { try { fs.unlinkSync(filePath); } catch (_) {} }
      );

    } catch (err) {
      console.error("[art] Error:", err?.response?.status || err.message);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}

      if (processingMsg?.messageID) {
        try { await message.unsend(processingMsg.messageID); } catch (_) {}
      }

      const msg = err.code === "ECONNABORTED" ? getLang("timeout") : getLang("error");
      return message.reply(msg);
    }
  }
};
