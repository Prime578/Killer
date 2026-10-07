const axios = require("axios");

module.exports = {
  config: {
    name: "npm2",
    version: "2.0",
    author: "Rafi",
    countDown: 5,
    role: 0,
    shortDescription: {
      en: "Get npm package info"
    },
    description: {
      en: "Fetches npm package information from Official Registry."
    },
    category: "info",
    guide: {
      en: "{p}npm <package name>"
    }
  },

  onStart: async function ({ message, args }) {
    const pkgName = args.join(" ");
    if (!pkgName) return message.reply("❌ | Please provide an npm package name.");

    try {
      const { data } = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`);

      const version = data["dist-tags"]?.latest || "N/A";
      const pkgInfo = data.versions?.[version] || {};

      const name = data.name || pkgName;
      let description = this.cleanText(data.description);
      if (!description) description = await this.fetchReadmeDescription(data.repository?.url);
      if (!description) description = "No description available.";
      const author = data.author?.name || pkgInfo.author?.name
        || (data.maintainers || []).map(m => m.name).filter(Boolean).join(", ")
        || "N/A";
      const license = data.license || pkgInfo.license || "N/A";
      const homepage = data.homepage || `https://www.npmjs.com/package/${name}`;
      const repository = data.repository?.url?.replace(/^git\+/, "") || "N/A";

      const replyMsg = `📦 Package: ${name}\n` +
                       `📌 Version: ${version}\n` +
                       `📝 Description: ${description}\n` +
                       `👤 Author: ${author}\n` +
                       `📃 License: ${license}\n` +
                       `🔗 Homepage: ${homepage}\n` +
                       `📁 Repository: ${repository}`;

      return message.reply(replyMsg);

    } catch (err) {
      if (err.response && err.response.status === 404) {
        return message.reply("❌ | Package not found.");
      }
      console.error(err);
      return message.reply("❌ | An error occurred while fetching package info.");
    }
  },

  cleanText: function (s) {
    if (!s) return "";
    return s.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
            .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
            .replace(/\s+/g, " ")
            .trim();
  },

  fetchReadmeDescription: async function (repoUrl) {
    try {
      const m = (repoUrl || "").match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!m) return "";
      const repo = `${m[1]}/${m[2]}`;
      for (const branch of ["main", "master"]) {
        try {
          const { data } = await axios.get(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`, { timeout: 10000 });
          const desc = this.parseReadme(data);
          if (desc) return desc;
        } catch {}
      }
    } catch {}
    return "";
  },

  parseReadme: function (md) {
    let inCode = false;
    let cur = [];
    const paras = [];
    for (const raw of (md || "").split("\n")) {
      const t = raw.trim();
      if (t.startsWith("```")) { inCode = !inCode; continue; }
      if (inCode) continue;
      if (!t) {
        if (cur.length) { paras.push(cur.join(" ")); cur = []; }
        continue;
      }
      if (/^#{1,6}\s/.test(t) || /^>/.test(t) || /^(\*|-|\d+[.)])\s/.test(t) || /^\|/.test(t) || /^!\[/.test(t)) {
        if (cur.length) { paras.push(cur.join(" ")); cur = []; }
        continue;
      }
      const cleaned = this.cleanText(t);
      if (cleaned) cur.push(cleaned);
    }
    if (cur.length) paras.push(cur.join(" "));
    for (const p of paras) if (p.length >= 20) return p;
    return "";
  }
};
