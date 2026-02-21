import express from "express";
import fs from "fs";
import session from "express-session";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false
}));

// ===== Discord Bot Setup =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.login(process.env.BOT_TOKEN);

client.on("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// ===== Voucher System =====
const voucherFile = "./vouchers.json";

if (!fs.existsSync(voucherFile)) fs.writeFileSync(voucherFile, "[]");

// Redeem via command
client.on("messageCreate", async message => {
  if (!message.content.startsWith(".redeem") || message.author.bot) return;
  const code = message.content.split(" ")[1];
  if (!code) return message.reply("Tolong masukkan kode voucher.");

  let vouchers = JSON.parse(fs.readFileSync(voucherFile));
  const voucher = vouchers.find(v => v.code === code && v.active);
  if (!voucher) return message.reply("Kode tidak valid atau sudah dipakai");

  // kasih role
  const guild = message.guild;
  const member = message.member;
  await member.roles.add(voucher.roleId);

  // catat user
  voucher.redeemedBy.push(message.author.id);
  fs.writeFileSync(voucherFile, JSON.stringify(vouchers, null, 2));

  message.reply(`Berhasil! Kamu mendapatkan role <@&${voucher.roleId}>`);
});

// ===== Express API untuk Dashboard =====

// Create voucher
app.post("/voucher/create", (req, res) => {
  const { code, roleId } = req.body;
  if (!code || !roleId) return res.json({ error: "code atau roleId kosong" });

  let vouchers = JSON.parse(fs.readFileSync(voucherFile));
  vouchers.push({ code, roleId, redeemedBy: [], active: true });
  fs.writeFileSync(voucherFile, JSON.stringify(vouchers, null, 2));

  res.json({ success: true });
});

// List vouchers
app.get("/voucher/list", (req, res) => {
  const vouchers = JSON.parse(fs.readFileSync(voucherFile));
  res.json(vouchers);
});

// ===== Serve dashboard =====
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "./public" });
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
});
