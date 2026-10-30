const axios = require('axios');
const { config } = global.GoatBot;
const { log, getText } = global.utils;

// stop any previous loop (relogin loads this file again)
if (global.timeOutUptime != undefined)
	clearTimeout(global.timeOutUptime);
if (!config.autoUptime.enable)
	return;

const PORT = process.env.PORT || config.dashBoard?.port || (!isNaN(config.serverUptime.port) && config.serverUptime.port) || 3001;

function resolveUrl() {
	let url = config.autoUptime.url;
	// config.json can't evaluate ${...}, so build the url from host env vars here
	if (!url || /\$\{/.test(url)) {
		const host = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_URL;
		if (host)
			url = host.startsWith('http') ? host : `https://${host}`;
		else if (process.env.REPL_OWNER)
			url = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
		else
			url = `http://localhost:${PORT}`;
	}
	return url.replace(/\/+$/, '') + '/uptime';
}

const myUrl = resolveUrl();
const intervalMs = (Number(config.autoUptime.timeInterval) || 180) * 1000;
let status = 'ok';

async function autoUptime() {
	try {
		await axios.get(myUrl, { timeout: 20000 });
		if (status != 'ok') {
			status = 'ok';
			log.info("UPTIME", "Bot is online");
		}
	}
	catch (e) {
		const err = e.response?.data || e;
		if (status == 'ok') {
			status = 'failed';
			if (err.statusAccountBot == "can't login")
				log.err("UPTIME", "Can't login account bot");
			else if (err.statusAccountBot == "block spam")
				log.err("UPTIME", "Your account is blocked");
		}
	}
	// exactly one pending timer at any time
	global.timeOutUptime = setTimeout(autoUptime, intervalMs);
}

global.timeOutUptime = setTimeout(autoUptime, intervalMs);
log.info("AUTO UPTIME", getText("autoUptime", "autoUptimeTurnedOn", myUrl));
