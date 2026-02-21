import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const app = express();

client.login(process.env.BOT_TOKEN);

client.on("ready", () => console.log(`Bot ready: ${client.user.tag}`));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(express.static('public'));

let vouchers = [];
if (fs.existsSync("vouchers.json")) vouchers = JSON.parse(fs.readFileSync("vouchers.json"));

function saveVouchers() {
  fs.writeFileSync("vouchers.json", JSON.stringify(vouchers, null, 2));
}

function generateVoucherCode(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// API untuk dashboard
app.get("/api/roles", async (req, res) => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();
  const roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name }));
  res.json(roles);
});

app.get("/api/vouchers", (req, res) => res.json(vouchers));

app.post("/api/vouchers", async (req, res) => {
  const { roleId, maxRedeem, autoGenerate } = req.body;
  const code = autoGenerate ? generateVoucherCode() : req.body.code;
  const voucher = { code, roleId, maxRedeem: parseInt(maxRedeem)||1, redeemed: [] };
  vouchers.push(voucher);
  saveVouchers();
  res.json(voucher);
});

// Slash command redeem
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "redeem") {
    const code = interaction.options.getString("code");
    const voucher = vouchers.find(v => v.code === code);
    if (!voucher) return interaction.reply({ content: "Voucher tidak valid", ephemeral: true });
    if (voucher.redeemed.length >= voucher.maxRedeem) return interaction.reply({ content: "Voucher sudah full", ephemeral: true });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(voucher.roleId);
    voucher.redeemed.push(interaction.user.id);
    saveVouchers();
    return interaction.reply({ content: `Berhasil redeem!`, ephemeral: true });
  }
});

app.listen(process.env.PORT, () => console.log(`Dashboard running: http://localhost:${process.env.PORT}`));