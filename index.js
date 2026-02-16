const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const axios = require("axios")
const qrcode = require("qrcode-terminal")
const yts = require("yt-search")
const ytdl = require("ytdl-core")

// ================= SETTINGS =================
const BOT_NAME = "FLAMEMASTER54"
const OWNER_NAME = "PRAISE G NDLEZANE"
const OWNER_NUMBER = "263776072260"
const OWNER_ID = OWNER_NUMBER + "@s.whatsapp.net"
const VERSION = "5.0.0"
const PREFIX = "."
let botMode = "public"

const const AI_API_KEY = process.env.AI_API_KEY
// ============================================

const startTime = Date.now()
let totalCommands = 0
const users = new Set()

function getUptime() {
    const ms = Date.now() - startTime
    const seconds = Math.floor(ms / 1000) % 60
    const minutes = Math.floor(ms / (1000 * 60)) % 60
    const hours = Math.floor(ms / (1000 * 60 * 60))
    return `${hours}h ${minutes}m ${seconds}s`
}

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("./auth")

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        browser: [BOT_NAME, "Chrome", "1.0"]
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log("Scan QR:\n")
            qrcode.generate(qr, { small: true })
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        }

        if (connection === "open") {
            console.log(`🔥 ${BOT_NAME} Connected Successfully`)
        }
    })

    // ================= WELCOME / GOODBYE =================
    sock.ev.on("group-participants.update", async (update) => {
        const { id, participants, action } = update

        for (let participant of participants) {
            const user = String(participant)
            const number = user.split("@")[0]

            if (action === "add") {
                await sock.sendMessage(id, {
                    text: `👋 Welcome @${number} to ${BOT_NAME} 🔥`,
                    mentions: [user]
                })
            }

            if (action === "remove") {
                await sock.sendMessage(id, {
                    text: `👋 Goodbye @${number}`,
                    mentions: [user]
                })
            }
        }
    })

    // ================= MESSAGE LISTENER =================
    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0]
        if (!msg.message) return
        if (msg.key.fromMe) return

        const sender = msg.key.remoteJid
        const isGroup = sender.endsWith("@g.us")
        const userId = msg.key.participant || sender

        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ""

        if (!body) return

// Auto React to Commands
if (body && body.startsWith(".")) {
    await sock.sendMessage(sender, {
        react: {
            text: "⚡",
            key: msg.key
        }
    })
}

        users.add(sender)

        // ================= MENU =================
        if (body === ".menu") {
            totalCommands++

            return sock.sendMessage(sender, {
                text: `
╔══════════════════════╗
      🔥 ${BOT_NAME} 🔥
╚══════════════════════╝

👤 Owner: ${OWNER_NAME}
📦 Version: ${VERSION}
⚡ Commands Used: ${totalCommands}
👥 Users: ${users.size}
⏳ Uptime: ${getUptime()}
🔑 Prefix: ${PREFIX}

━━━━━━━━━━━━━━━━━━
📌 MAIN COMMANDS
━━━━━━━━━━━━━━━━━━
.menu       → Show Menu
.play       → Play Music
.kick       → Remove User
.promote    → Promote User
.demote     → Demote User
.lock       → Lock Group
.unlock     → Unlock Group
.ai         → Ask AI (example: .who is einstein)

━━━━━━━━━━━━━━━━━━
🔥 Powered by ${OWNER_NAME}
`
            })
        }

        // ================= ADMIN CHECK =================
        async function isAdmin() {
            if (!isGroup) return false
            const groupMetadata = await sock.groupMetadata(sender)
            const admins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id)
            return admins.includes(userId)
        }

        // ================= KICK =================
        if (body.startsWith(".kick")) {
            if (!isGroup) return sock.sendMessage(sender, { text: "Group only command." })
            if (!(await isAdmin()) && userId !== OWNER_ID)
                return sock.sendMessage(sender, { text: "Admins only." })

            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid
            if (!mentioned) return sock.sendMessage(sender, { text: "Tag user to kick." })

            await sock.groupParticipantsUpdate(sender, mentioned, "remove")
        }

        // ================= PROMOTE =================
        if (body.startsWith(".promote")) {
            if (!isGroup) return
            if (!(await isAdmin()) && userId !== OWNER_ID) return

            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid
            if (!mentioned) return

            await sock.groupParticipantsUpdate(sender, mentioned, "promote")
        }

        // ================= DEMOTE =================
        if (body.startsWith(".demote")) {
            if (!isGroup) return
            if (!(await isAdmin()) && userId !== OWNER_ID) return

            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid
            if (!mentioned) return

            await sock.groupParticipantsUpdate(sender, mentioned, "demote")
        }

        // ================= LOCK =================
        if (body === ".lock") {
            if (!isGroup) return
            if (!(await isAdmin()) && userId !== OWNER_ID) return

            await sock.groupSettingUpdate(sender, "announcement")
            sock.sendMessage(sender, { text: "🔒 Group locked." })
        }

        // ================= UNLOCK =================
        if (body === ".unlock") {
            if (!isGroup) return
            if (!(await isAdmin()) && userId !== OWNER_ID) return

            await sock.groupSettingUpdate(sender, "not_announcement")
            sock.sendMessage(sender, { text: "🔓 Group unlocked." })
        }

       // ================= MUSIC =================
if (body.startsWith(".play")) {
    const songName = body.replace(".play", "").trim()
    if (!songName)
        return sock.sendMessage(sender, { text: "🎵 Provide song name." })

    try {
        await sock.sendMessage(sender, { text: "🔎 Searching..." })

        const search = await yts(songName)
        if (!search.videos.length)
            return sock.sendMessage(sender, { text: "❌ Not found." })

        const video = search.videos[0]

        const message = `
🎵 *${video.title}*

👤 Channel: ${video.author.name}
⏱ Duration: ${video.timestamp}
👀 Views: ${video.views}

🔗 Watch here:
${video.url}
        `

        await sock.sendMessage(sender, { text: message })

    } catch (err) {
        console.log(err)
        await sock.sendMessage(sender, { text: "❌ Error finding song." })
    }
}

        // ================= AI =================
        if (body.startsWith(".") &&
            !body.startsWith(".play") &&
            body !== ".menu" &&
            body !== ".lock" &&
            body !== ".unlock" &&
            !body.startsWith(".kick") &&
            !body.startsWith(".promote") &&
            !body.startsWith(".demote")
        ) {

            const question = body.slice(1).trim()
            if (!question) return

            try {
                const response = await axios.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        model: "openai/gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: `You are Flame AI created by ${OWNER_NAME}` },
                            { role: "user", content: question }
                        ]
                    },
                    {
                        headers: {
                            "Authorization": `Bearer ${AI_API_KEY}`,
                            "Content-Type": "application/json"
                        }
                    }
                )

                const reply = response.data.choices[0].message.content
                await sock.sendMessage(sender, { text: reply })

            } catch {
                await sock.sendMessage(sender, { text: "AI error." })
            }
        }

    })
}


startBot()
