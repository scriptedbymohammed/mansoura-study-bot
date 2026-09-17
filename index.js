require("dotenv").config();
const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200);
    res.end("DevFocus Bot is running!");
}).listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// ==========================================
// CLIENT
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// SESSIONS
// Key = Voice Channel ID
// ==========================================

const sessions = new Map();

// ==========================================
// SLASH COMMAND
// ==========================================

const commands = [
    new SlashCommandBuilder()
        .setName("study")
        .setDescription("Start a Pomodoro study session in your voice channel")

        .addIntegerOption(option =>
            option
                .setName("minutes")
                .setDescription("Study duration in minutes")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(180)
        )

        .addIntegerOption(option =>
            option
                .setName("break")
                .setDescription("Break duration in minutes")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(60)
        )
].map(command => command.toJSON());

// ==========================================
// REST
// ==========================================

const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

// ==========================================
// READY
// ==========================================

client.once("clientReady", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log("✅ Slash commands registered");
    } catch (error) {
        console.error("❌ Command registration error:", error);
    }
});

// ==========================================
// FORMAT TIME
// ==========================================

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
}

// ==========================================
// PROGRESS BAR
// ==========================================

function progressBar(progress) {
    const total = 12;

    const filled = Math.round(progress * total);
    const empty = total - filled;

    return "🟪".repeat(filled) + "⬜".repeat(empty);
}

// ==========================================
// GET REMAINING
// ==========================================

function getRemaining(session) {
    if (session.state === "paused") {
        return session.remainingSeconds;
    }

    return Math.max(
        0,
        Math.ceil(
            (session.endTime - Date.now()) / 1000
        )
    );
}

// ==========================================
// VOICE MEMBERS COUNT
// ==========================================

function getVoiceMemberCount(session) {
    const guild = client.guilds.cache.get(
        session.guildId
    );

    if (!guild) return 0;

    const voiceChannel =
        guild.channels.cache.get(
            session.voiceChannelId
        );

    if (!voiceChannel) return 0;

    return voiceChannel.members.filter(
        member => !member.user.bot
    ).size;
}

// ==========================================
// COUNTDOWN
// ==========================================

function createCountdown(session) {
    const remaining = getRemaining(session);

    return `**${formatTime(remaining)}**`;
}

// ==========================================
// STUDY EMBED
// ==========================================

function studyEmbed(session) {
    const remaining = getRemaining(session);

    const totalSeconds =
        session.studyMinutes * 60;

    const progress = Math.min(
        1,
        Math.max(
            0,
            1 - remaining / totalSeconds
        )
    );

    const members =
        getVoiceMemberCount(session);

    return new EmbedBuilder()
        .setTitle("📚 Study Time")
        .setDescription(
            "**Focus time — stay locked in! 🔒**"
        )

        .addFields(
            {
                name: "⏱️ Time remaining",
                value: createCountdown(session),
                inline: true
            },

            {
                name: "📊 Progress",
                value:
                    `${progressBar(progress)}\n` +
                    `**${Math.round(progress * 100)}%**`,
                inline: false
            },

            {
                name: "🎯 Mode",
                value:
                    session.state === "paused"
                        ? "⏸️ Paused"
                        : "Study",
                inline: true
            },

            {
                name: "🍅 Pomodoros",
                value: `${session.pomodoros}`,
                inline: true
            },

            {
                name: "☕ Break",
                value: `${session.breakMinutes} min`,
                inline: true
            },

            {
                name: "👥 In Study Room",
                value: `${members}`,
                inline: true
            }
        );
}

// ==========================================
// BREAK EMBED
// ==========================================

function breakEmbed(session) {
    const remaining = getRemaining(session);

    const totalSeconds =
        session.breakMinutes * 60;

    const progress = Math.min(
        1,
        Math.max(
            0,
            1 - remaining / totalSeconds
        )
    );

    const members =
        getVoiceMemberCount(session);

    return new EmbedBuilder()
        .setTitle("☕ Break Time")
        .setDescription(
            "**Take a break. You earned it! 🧘**"
        )

        .addFields(
            {
                name: "⏱️ Time remaining",
                value: createCountdown(session),
                inline: true
            },

            {
                name: "📊 Progress",
                value:
                    `${progressBar(progress)}\n` +
                    `**${Math.round(progress * 100)}%**`,
                inline: false
            },

            {
                name: "🎯 Mode",
                value:
                    session.state === "paused"
                        ? "⏸️ Paused"
                        : "Break",
                inline: true
            },

            {
                name: "🍅 Pomodoros",
                value: `${session.pomodoros}`,
                inline: true
            },

            {
                name: "👥 In Study Room",
                value: `${members}`,
                inline: true
            }
        );
}

// ==========================================
// STUDY BUTTONS
// ==========================================

function studyButtons(session) {
    const pauseOrResume =
        session.state === "paused"
            ? new ButtonBuilder()
                .setCustomId(
                    `resume_${session.voiceChannelId}`
                )
                .setLabel("Resume")
                .setEmoji("▶️")
                .setStyle(ButtonStyle.Success)

            : new ButtonBuilder()
                .setCustomId(
                    `pause_${session.voiceChannelId}`
                )
                .setLabel("Pause")
                .setEmoji("⏸️")
                .setStyle(ButtonStyle.Secondary);

    return [
        new ActionRowBuilder().addComponents(
            pauseOrResume,

            new ButtonBuilder()
                .setCustomId(
                    `add_${session.voiceChannelId}`
                )
                .setLabel("+5 Min")
                .setEmoji("➕")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `reset_${session.voiceChannelId}`
                )
                .setLabel("Reset")
                .setEmoji("🔄")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(
                    `stop_${session.voiceChannelId}`
                )
                .setLabel("Stop")
                .setEmoji("⏹️")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

// ==========================================
// BREAK BUTTONS
// ==========================================

function breakButtons(session) {
    const pauseOrResume =
        session.state === "paused"
            ? new ButtonBuilder()
                .setCustomId(
                    `resume_${session.voiceChannelId}`
                )
                .setLabel("Resume")
                .setEmoji("▶️")
                .setStyle(ButtonStyle.Success)

            : new ButtonBuilder()
                .setCustomId(
                    `pause_${session.voiceChannelId}`
                )
                .setLabel("Pause")
                .setEmoji("⏸️")
                .setStyle(ButtonStyle.Secondary);

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `skip_${session.voiceChannelId}`
                )
                .setLabel("Skip Break")
                .setEmoji("⏭️")
                .setStyle(ButtonStyle.Primary),

            pauseOrResume,

            new ButtonBuilder()
                .setCustomId(
                    `reset_${session.voiceChannelId}`
                )
                .setLabel("Reset")
                .setEmoji("🔄")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(
                    `stop_${session.voiceChannelId}`
                )
                .setLabel("Stop")
                .setEmoji("⏹️")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

// ==========================================
// GET CURRENT COMPONENTS
// ==========================================

function getButtons(session) {
    return session.mode === "study"
        ? studyButtons(session)
        : breakButtons(session);
}

// ==========================================
// GET CURRENT EMBED
// ==========================================

function getEmbed(session) {
    return session.mode === "study"
        ? studyEmbed(session)
        : breakEmbed(session);
}

// ==========================================
// UPDATE MESSAGE
// ==========================================

async function updateSessionMessage(session) {
    if (!session.message) return;

    try {
        await session.message.edit({
            embeds: [getEmbed(session)],
            components: getButtons(session)
        });
    } catch (error) {
        console.error(
            "❌ Message update error:",
            error.message
        );
    }
}

// ==========================================
// START TIMER
// ==========================================

function startTimer(session) {
    clearInterval(session.interval);

    session.state = "running";

    session.endTime =
        Date.now() +
        session.remainingSeconds * 1000;

    session.interval = setInterval(
        async () => {

            const remaining =
                getRemaining(session);

            if (remaining <= 0) {

                clearInterval(
                    session.interval
                );

                session.remainingSeconds = 0;

                await finishPhase(session);

                return;
            }

            session.remainingSeconds =
                remaining;

            await updateSessionMessage(
                session
            );

        },
        1000
    );
}

// ==========================================
// FINISH PHASE
// ==========================================

async function finishPhase(session) {

    if (
        !sessions.has(
            session.voiceChannelId
        )
    ) {
        return;
    }

    // ======================================
    // STUDY → BREAK
    // ======================================

    if (session.mode === "study") {

        session.pomodoros++;

        session.mode = "break";

        session.remainingSeconds =
            session.breakMinutes * 60;

        startTimer(session);

        await updateSessionMessage(
            session
        );

        return;
    }

    // ======================================
    // BREAK → STUDY
    // ======================================

    session.mode = "study";

    session.remainingSeconds =
        session.studyMinutes * 60;

    startTimer(session);

    await updateSessionMessage(
        session
    );
}

// ==========================================
// SLASH COMMAND
// ==========================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        if (
            interaction.commandName !== "study"
        ) {
            return;
        }

        // ==================================
        // CHECK VOICE
        // ==================================

        const voiceChannelId =
            interaction.member?.voice?.channelId;

        if (!voiceChannelId) {

            await interaction.reply({
                content:
                    "⚠️ Join a voice channel first, then start the study session.",
                flags: 64
            });

            return;
        }

        // ==================================
        // CHECK EXISTING SESSION
        // ==================================

        if (sessions.has(voiceChannelId)) {

            await interaction.reply({
                content:
                    "⚠️ There is already an active study session in this voice channel.",
                flags: 64
            });

            return;
        }

        // ==================================
        // OPTIONS
        // ==================================

        const studyMinutes =
            interaction.options.getInteger(
                "minutes"
            );

        const breakMinutes =
            interaction.options.getInteger(
                "break"
            ) || 5;

        // ==================================
        // CREATE SESSION
        // ==================================

        const session = {

            guildId:
                interaction.guildId,

            voiceChannelId,

            textChannelId:
                interaction.channelId,

            startedBy:
                interaction.user.id,

            studyMinutes,

            breakMinutes,

            mode: "study",

            state: "running",

            remainingSeconds:
                studyMinutes * 60,

            endTime: null,

            interval: null,

            pomodoros: 0,

            message: null
        };

        // ==================================
        // SET INITIAL END TIME
        // ==================================

        session.endTime =
            Date.now() +
            session.remainingSeconds * 1000;

        // ==================================
        // SAVE SESSION
        // ==================================

        sessions.set(
            voiceChannelId,
            session
        );

        // ==================================
        // SEND MESSAGE
        // ==================================

        try {

            await interaction.reply({
                embeds: [
                    studyEmbed(session)
                ],
                components: [
                    ...studyButtons(session)
                ]
            });

            session.message =
                await interaction.fetchReply();

            // ==============================
            // START TIMER
            // ==============================

            startTimer(session);

        } catch (error) {

            sessions.delete(
                voiceChannelId
            );

            console.error(
                "❌ Failed to start session:",
                error
            );

            if (!interaction.replied) {

                await interaction.reply({
                    content:
                        "❌ Something went wrong while starting the study session.",
                    flags: 64
                });
            }
        }
    }
);

// ==========================================
// BUTTON HANDLER
// ==========================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        // ==================================
        // GET ACTION + VOICE CHANNEL
        // ==================================

        const [
            action,
            voiceChannelId
        ] = interaction.customId.split("_");

        // ==================================
        // GET SESSION
        // ==================================

        const session =
            sessions.get(voiceChannelId);

        if (!session) {

            await interaction.reply({
                content:
                    "⚠️ This study session is no longer active.",
                flags: 64
            });

            return;
        }

        // ==================================
        // CHECK SAME VOICE
        // ==================================

        const currentVoiceChannelId =
            interaction.member?.voice?.channelId;

        if (
            currentVoiceChannelId !==
            session.voiceChannelId
        ) {

            await interaction.reply({
                content:
                    "🔒 You must be in the same voice channel to control this study session.",
                flags: 64
            });

            return;
        }

        // ==================================
        // PAUSE
        // ==================================

        if (action === "pause") {

            if (
                session.state === "paused"
            ) {

                await interaction.reply({
                    content:
                        "⚠️ The session is already paused.",
                    flags: 64
                });

                return;
            }

            session.remainingSeconds =
                getRemaining(session);

            clearInterval(
                session.interval
            );

            session.state = "paused";

            session.endTime = null;

            await interaction.update({
                embeds: [
                    getEmbed(session)
                ],
                components:
                    getButtons(session)
            });

            return;
        }

        // ==================================
        // RESUME
        // ==================================

        if (action === "resume") {

            if (
                session.state !== "paused"
            ) {

                await interaction.reply({
                    content:
                        "⚠️ The session is already running.",
                    flags: 64
                });

                return;
            }

            startTimer(session);

            await interaction.update({
                embeds: [
                    getEmbed(session)
                ],
                components:
                    getButtons(session)
            });

            return;
        }

        // ==================================
        // ADD 5 MINUTES
        // ==================================

        if (action === "add") {

            session.remainingSeconds =
                getRemaining(session) + 300;

            if (
                session.state === "running"
            ) {
                startTimer(session);
            }

            await interaction.update({
                embeds: [
                    getEmbed(session)
                ],
                components:
                    getButtons(session)
            });

            return;
        }

        // ==================================
        // SKIP BREAK
        // ==================================

        if (action === "skip") {

            if (
                session.mode !== "break"
            ) {

                await interaction.reply({
                    content:
                        "⚠️ You can only skip during a break.",
                    flags: 64
                });

                return;
            }

            session.mode = "study";

            session.remainingSeconds =
                session.studyMinutes * 60;

            startTimer(session);

            await interaction.update({
                embeds: [
                    studyEmbed(session)
                ],
                components:
                    studyButtons(session)
            });

            return;
        }

        // ==================================
        // STOP
        // ==================================

        if (action === "stop") {

            clearInterval(
                session.interval
            );

            sessions.delete(
                session.voiceChannelId
            );

            const stoppedEmbed =
                new EmbedBuilder()
                    .setTitle(
                        "⏹️ Study Session Stopped"
                    )
                    .setDescription(
                        `The study session in this voice channel has been stopped.\n\n` +
                        `🍅 Pomodoros completed: **${session.pomodoros}**`
                    );

            await interaction.update({
                embeds: [stoppedEmbed],
                components: []
            });

            return;
        }

        // ==================================
        // RESET
        // ==================================

        if (action === "reset") {

            clearInterval(
                session.interval
            );

            session.mode = "study";

            session.state = "running";

            session.remainingSeconds =
                session.studyMinutes * 60;

            session.endTime =
                Date.now() +
                session.remainingSeconds * 1000;

            startTimer(session);

            await interaction.update({
                embeds: [
                    studyEmbed(session)
                ],
                components:
                    studyButtons(session)
            });

            return;
        }
    }
);

// ==========================================
// ERROR HANDLING
// ==========================================

client.on(
    "error",
    error => {
        console.error(
            "❌ Discord Client Error:",
            error
        );
    }
);

// ==========================================
// LOGIN
// ==========================================

client.login(
    process.env.DISCORD_TOKEN
);
