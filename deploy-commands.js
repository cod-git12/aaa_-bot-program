const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("コマンド一覧を表示します"),

  new SlashCommandBuilder()
    .setName("wikipedia")
    .setDescription("日本語Wikipediaで記事を検索します")
    .addStringOption(opt =>
      opt.setName("ワード")
        .setDescription("検索するキーワード")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Bloxd攻略Wikiのランダムなページを表示します"),

  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Bloxd攻略Wikiにページが存在するか確認します")
    .addStringOption(opt =>
      opt.setName("ページ名")
        .setDescription("確認したいページ名（例: ゲームモード/ベッドウォーズ）")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Bloxd攻略Wikiのページをキーワードで検索します")
    .addStringOption(opt =>
      opt.setName("キーワード")
        .setDescription("検索するキーワード（部分一致）")
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("テキストを翻訳します")
    .addStringOption(opt =>
      opt.setName("テキスト")
        .setDescription("翻訳したい文字")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("言語")
        .setDescription("翻訳先の言語 (デフォルトは日本語)")
        .setRequired(false).addChoices(
          { name: "日本語", value: "ja" },
          { name: "英語", value: "en" },
          { name: "韓国語", value: "ko" },
          { name: "中国語", value: "zh" },
          { name: "フランス語", value: "fr" },
          { name: "ドイツ語", value: "de" }
        )
    ),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("スラッシュコマンドを登録中...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`✅ ${commands.length}件のコマンドを登録しました。`);
  } catch (err) {
    console.error("コマンド登録エラー:", err);
  }
})();