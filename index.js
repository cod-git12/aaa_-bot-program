const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events
} = require("discord.js");
const http = require("http");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is alive!");
}).listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const UPDATE_CHANNEL_ID = "1456250291627229184";
const BLOXD_WIKI_BASE = "https://bloxd.wikiru.jp/?";

let cachedPages = new Set();

async function fetchPageList() {
  try {
    const res = await fetch("https://bloxd.wikiru.jp/?cmd=list");
    const html = await res.text();
    const regex = /href="\.\/\?([^"#]+)"/g;
    const pages = new Set();
    let match;
    while ((match = regex.exec(html)) !== null) {
      const encoded = match[1];
      if (encoded.startsWith("cmd=") || encoded.startsWith("plugin=")) continue;
      const decoded = decodeURIComponent(encoded.replace(/\+/g, " "));
      pages.add(decoded);
    }
    cachedPages = pages;
    console.log(`✅ ページリスト更新: ${cachedPages.size}件`);
  } catch (err) {
    console.error("❌ ページリスト取得失敗:", err);
  }
}

function buildBloxdWikiUrl(pageName) {
  return BLOXD_WIKI_BASE + encodeURIComponent(pageName).replace(/%20/g, "+");
}

function pageExists(pageName) {
  return cachedPages.has(pageName);
}

async function fetchWikiPageText(pageName) {
  try {
    const url = buildBloxdWikiUrl(pageName);
    const res = await fetch(url);
    const html = await res.text();
    const bodyMatch = html.match(/<div id="body">([\s\S]*?)<\/div>/);
    if (!bodyMatch) return null;
    const text = bodyMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .trim();
    return text.slice(0, 30000);
  } catch {
    return null;
  }
}

async function askGemini(question, wikiContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "APIキーが設定されてないよ。bot担当者に確認してね。";
  
  const modelName = "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = wikiContext
    ? `あなたはBloxd攻略Wikiをもとに質問に答えるアシスタントです。以下のWikiの内容を参考に、日本語で答えてください。Wikiに載っていない情報については「Wikiには記載がありません」と伝えてください。\n\n【Wikiの内容】\n${wikiContext}\n\n【質問】\n${question}`
    : `あなたはBloxdというゲームの攻略アシスタントです。Bloxd攻略Wiki（bloxd.wikiru.jp）をもとに、日本語で簡潔に答えてください。\n\n【質問】\n${question}`;

  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ [Gemini API Error Data]", JSON.stringify(data, null, 2));
      
      const errMsg = data.error?.message || "不明なエラー";

      if (errMsg.includes("API key not valid")) {
        return "APIキーが間違っているよ。APIキーを確認してね。";
      }
      if (errMsg.includes("location is not supported")) {
        return "エラー: サーバーの場所が対応していないよ。bot担当者に確認してね。";
      }
      if (response.status === 429) {
        return "質問が多すぎて今対応しきれてないよ！少しあとにまた試してみてね。";
      }
      
      return `Google側でエラーが発生しました (${response.status}): ${errMsg}`;
    }

    return data.candidates[0].content.parts[0].text;

  } catch (err) {
    console.error("❌ [Fetch Error]", err.message);
    return `通信エラーが発生しました: ${err.message}`;
  }
}
async function searchWikipedia(query) {
  const searchRes = await fetch(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
  );
  const searchData = await searchRes.json();
  const results = searchData?.query?.search;
  if (!results || results.length === 0) return null;

  const title = results[0].title;
  const summaryRes = await fetch(
    `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  if (!summaryRes.ok) return null;
  const data = await summaryRes.json();

  return {
    title: data.title,
    extract: data.extract?.slice(0, 400) || "説明なし",
    pageUrl: data.content_urls?.desktop?.page || `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    thumbnail: data.thumbnail?.source || null
  };
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await fetchPageList();
  setInterval(fetchPageList, 30 * 60 * 1000);

  const channel = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
  if (channel) {
    channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🚀 Botが起動したよ！")
          .setDescription("Botがアップデートされたよ！")
          .addFields({ name: "起動時刻", value: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) })
          .setColor(0x00ff99)
          .setTimestamp()
      ]
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    return interaction.reply(`🏓 Pong! \`${latency}ms\``);
  }

  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 コマンド一覧")
      .setColor(0x57c4ff)
      .addFields(
        { name: "/ping", value: "Botの応答速度を確認" },
        { name: "/wikipedia <ワード>", value: "日本語Wikipediaで記事を検索" },
        { name: "/random", value: "Bloxd攻略Wikiのランダムなページを表示" },
        { name: "/check <ページ名>", value: "Bloxd攻略Wikiにページが存在するか確認" },
        { name: "/search <キーワード>", value: "Bloxd攻略Wikiのページをキーワードで部分一致検索" },
        { name: "━━ ショートカット ━━", value: "`BKW: ページ名!` → wikiリンクを送信\n`[[ページ名]]` → wikiリンクを自動返信\n`@Bot 質問` → wikiをもとにAIが回答" }
      )
      .setFooter({ text: "Bloxd攻略Wiki: bloxd.wikiru.jp" });
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "wikipedia") {
    const query = interaction.options.getString("ワード");
    await interaction.deferReply();
    try {
      const result = await searchWikipedia(query);
      if (!result) {
        return interaction.editReply(`❌ 「${query}」に関するWikipedia記事は見つからなかったよ。`);
      }
      const embed = new EmbedBuilder()
        .setTitle(`📖 ${result.title}`)
        .setDescription(result.extract + (result.extract.length >= 400 ? "…" : ""))
        .setURL(result.pageUrl)
        .setColor(0xf5f5f5)
        .setFooter({ text: "出典: Wikipedia (ja)" })
        .setTimestamp();
      if (result.thumbnail) embed.setThumbnail(result.thumbnail);
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply("❌ Wikipedia取得中にエラーが発生したよ。もう一回試してみてね。");
    }
  }

  if (commandName === "random") {
    if (cachedPages.size === 0) {
      return interaction.reply("❌ ページリストを取得している途中だよ。しばらく待ってから試してね");
    }
    const pagesArray = [...cachedPages];
    const randomPage = pagesArray[Math.floor(Math.random() * pagesArray.length)];
    const url = buildBloxdWikiUrl(randomPage);
    const embed = new EmbedBuilder()
      .setTitle(`🎲 ${randomPage}`)
      .setDescription(`[Bloxd攻略Wikiで開く](${url})`)
      .setURL(url)
      .setColor(0x57c4ff)
      .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "check") {
    const pageName = interaction.options.getString("ページ名");
    if (cachedPages.size === 0) {
      return interaction.reply("❌ ページリストを取得している途中だよ。しばらく待ってから試してね");
    }
    if (pageExists(pageName)) {
      const url = buildBloxdWikiUrl(pageName);
      const embed = new EmbedBuilder()
        .setTitle(`✅ ${pageName}`)
        .setDescription(`ページが存在したよ。\n[Bloxd攻略Wikiで開く](${url})`)
        .setURL(url)
        .setColor(0x00cc66)
        .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" });
      return interaction.reply({ embeds: [embed] });
    } else {
      return interaction.reply(`❌ 「${pageName}」というページはBloxd攻略Wikiに存在しないよ。`);
    }
  }

  if (commandName === "search") {
    const keyword = interaction.options.getString("キーワード");
    if (cachedPages.size === 0) {
      return interaction.reply("❌ ページリストを取得している途中だよ。しばらく待ってから試してね");
    }
    const matched = [...cachedPages].filter(p =>
      p.toLowerCase().includes(keyword.toLowerCase())
    );
    if (matched.length === 0) {
      return interaction.reply(`🔍 「${keyword}」を含むページは見つからなかったよ。`);
    }
    const lines = matched.map(p => `• [${p}](${buildBloxdWikiUrl(p)})`);
    const MAX_CHARS = 3800;
    let description = "";
    let truncated = false;
    for (const line of lines) {
      if ((description + "\n" + line).length > MAX_CHARS) {
        truncated = true;
        break;
      }
      description += (description ? "\n" : "") + line;
    }
    if (truncated) description += `\n\n*検索結果が多すぎて全部表示できなかったよ。キーワードを絞り込んでね*`;
    const embed = new EmbedBuilder()
      .setTitle(`🔍 「${keyword}」の検索結果 (${matched.length}件)`)
      .setDescription(description)
      .setColor(0x57c4ff)
      .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" });
    return interaction.reply({ embeds: [embed] });
  }
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const bkwMatch = msg.content.match(/^BKW:\s*(.+)!$/);
  if (bkwMatch) {
    const pageName = bkwMatch[1].trim();
    if (!pageExists(pageName)) {
      return msg.reply(`❌ 「${pageName}」というページはBloxd攻略Wikiに存在しないよ。`);
    }
    const url = buildBloxdWikiUrl(pageName);
    const embed = new EmbedBuilder()
      .setTitle(`📖 ${pageName}`)
      .setDescription(`[Bloxd攻略Wikiで開く](${url})`)
      .setURL(url)
      .setColor(0x57c4ff)
      .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" })
      .setTimestamp();
    return msg.reply({ embeds: [embed] });
  }

  const bracketMatches = [...msg.content.matchAll(/\[\[(.+?)\]\]/g)];
  if (bracketMatches.length > 0) {
    const embeds = [];
    for (const m of bracketMatches) {
      const pageName = m[1].trim();
      if (!pageExists(pageName)) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(`❌ ${pageName}`)
            .setDescription("このページはBloxd攻略Wikiに存在しないよ。")
            .setColor(0xff4444)
        );
      } else {
        const url = buildBloxdWikiUrl(pageName);
        embeds.push(
          new EmbedBuilder()
            .setTitle(`📖 ${pageName}`)
            .setDescription(`[Bloxd攻略Wikiで開く](${url})`)
            .setURL(url)
            .setColor(0x57c4ff)
            .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" })
        );
      }
    }
    return msg.reply({ embeds: embeds.slice(0, 10) });
  }

  if (msg.mentions.has(client.user)) {
    const question = msg.content
      .replace(/<@!?[0-9]+>/g, "")
      .trim();

    if (!question) {
      return msg.reply("質問を入力してね！（例: `@Bot ベッドウォーズの攻略を教えて！`）");
    }

    const thinkingMsg = await msg.reply("🤔 考え中...");

    try {
      const urlRegex = /https:\/\/bloxd\.wikiru\.jp\/\?([^\s?]+)/g;
      let urlMatched = [];
      let m;
      while ((m = urlRegex.exec(question)) !== null) {
        urlMatched.push(decodeURIComponent(m[1].replace(/\+/g, " ")));
      }

      const keywordMatched = [...cachedPages].filter(p =>
        p.toLowerCase().split(/[\/\s]/).some(part =>
          question.toLowerCase().includes(part.toLowerCase()) && part.length >= 2
        )
      );

      const allMatched = [...new Set([...urlMatched, ...keywordMatched])];

      let wikiContext = null;
      if (allMatched.length > 0) {
        const topPages = allMatched.slice(0, 5);
        const texts = await Promise.all(topPages.map(p => fetchWikiPageText(p)));
        const combined = topPages
          .map((p, i) => texts[i] ? `【${p}】\n${texts[i]}` : null)
          .filter(Boolean)
          .join("\n\n");
        if (combined) wikiContext = combined;
      }

      const answer = await askGemini(question, wikiContext);

      const embed = new EmbedBuilder()
        .setDescription(answer.slice(0, 4096))
        .setColor(0x57c4ff)
        .setFooter({ text: wikiContext ? "📖 Bloxd攻略Wiki をもとに回答" : "💬 一般的な知識をもとに回答" })
        .setTimestamp();

      await thinkingMsg.edit({ content: "", embeds: [embed] });
    } catch (err) {
      console.error("❌ API エラー:", err);
      await thinkingMsg.edit("❌ 回答の取得中にエラーが発生しました。もう一度試してください。");
    }
  }
});

client.on("debug", (info) => {
  if (info.includes("Heartbeat")) return;
  console.log(`[Discord Debug] ${info}`);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("❌ ログイン失敗:", err);
});
