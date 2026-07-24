const mongoose = require('mongoose');



// SCHEMAS
const muzammil_toggleSchema = new mongoose.Schema({
    jid: { type: String, required: true },
    command: { type: String, required: true },
    isEnabled: { type: Boolean, default: true }
});

const muzammil_userSettingsSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    autoStatusSeen: { type: Boolean, default: false },
    autoStatusReact: { type: Boolean, default: false },
    autoStatusMessage: { type: Boolean, default: false },
    autoTyping: { type: Boolean, default: false },
    autoRecording: { type: Boolean, default: false },
    autoViewOnce: { type: Boolean, default: false }
});

const muzammil_autoReplySchema = new mongoose.Schema({
    trigger: { type: String, required: true },
    reply: { type: String, required: true }
});

const muzammil_rankSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    role: { type: String, default: 'Novice' }
});

const muzammil_sessionIndexSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const muzammil_bgmSchema = new mongoose.Schema({
    trigger: { type: String, required: true },
    audioUrl: { type: String, required: true },
    mimetype: { type: String, default: 'audio/mp4' }
});

const muzammil_bgmConfigSchema = new mongoose.Schema({
    isEnabled: { type: Boolean, default: true }
});

const muzammil_mentionSchema = new mongoose.Schema({
    type: { type: String, default: 'text' }, // text, audio, image
    content: { type: String, required: true },
    mimetype: { type: String }
});

const muzammil_mentionConfigSchema = new mongoose.Schema({
    isEnabled: { type: Boolean, default: true }
});

const muzammil_botConfigSchema = new mongoose.Schema({
    prefix: { type: String, default: '.' },
    menuImage: { type: String, default: '' },
    autoRead: { type: Boolean, default: false },
    autoRejectCall: { type: Boolean, default: false },
    autoWelcome: { type: Boolean, default: false },
    autoGoodbye: { type: Boolean, default: false },
    welcomeMessage: { type: String, default: '' },
    goodbyeMessage: { type: String, default: '' },
    ownerName: { type: String, default: 'Muzammil' },
    ownerNumber: { type: String, default: '' },
    ownerJid: { type: String, default: '' },
    sudo: { type: [String], default: [] }, // Array of Sudo JIDs
    autoStatusSeen: { type: Boolean, default: true },
    autoStatusReact: { type: Boolean, default: true },
    autoStatusSave: { type: Boolean, default: false },
    autoStatusEmojis: { type: [String], default: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🌈', '🔥'] }
});

const muzammil_groupSettingsSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    // Antilink settings
    antilink: { type: Boolean, default: false },
    antilinkMode: { type: String, default: 'delete' }, // warn, delete, remove (kick)
    antilinkWarnings: { type: Map, of: Number, default: {} }, // user JID -> warning count
    antilinkMaxWarnings: { type: Number, default: 3 },
    antilinkWhitelist: { type: [String], default: [] }, // Whitelisted link patterns
    // Antidelete settings
    antidelete: { type: Boolean, default: false },
    antideleteDestination: { type: String, default: 'group' }, // group, owner, both
    // Other settings
    welcome: { type: Boolean, default: false },
    goodbye: { type: Boolean, default: false },
    autoForward: { type: Boolean, default: false },
    autoForwardTargets: { type: [String], default: [] }
});

// ---------------------------------------------------------------------------
// FSR CONFIG (global, company-wide — not tied to a login user anymore since
// login is now gated by ERP ID, not a dashboard-created account)
// ---------------------------------------------------------------------------
const FSR_CONFIG_KEY = 'global';

const muzammil_fsrConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: FSR_CONFIG_KEY },
    groupJid: { type: String, default: '' }
}, { timestamps: true });

let FsrConfigModel;
function getFsrConfigModel() {
    if (!FsrConfigModel) FsrConfigModel = mongoose.models.muzammil_FsrConfig || mongoose.model('muzammil_FsrConfig', muzammil_fsrConfigSchema, 'muzammil.fsrconfigs');
    return FsrConfigModel;
}

// ---- FSR config ----
async function muzammil_getFsrConfig() {
    if (!isConnected) return null;

    try {
        const Model = getFsrConfigModel();
        let cfg = await Model.findOne({ key: FSR_CONFIG_KEY });
        if (!cfg) cfg = await Model.create({ key: FSR_CONFIG_KEY });
        return cfg;
    } catch (e) { console.error('DB Error getFsrConfig:', e); return null; }
}

async function muzammil_saveFsrConfig(updates) {
    if (!isConnected) return false;
    try {
        await getFsrConfigModel().findOneAndUpdate({ key: FSR_CONFIG_KEY }, updates, { upsert: true, returnDocument: 'after' });
        return true;
    } catch (e) { console.error('DB Error saveFsrConfig:', e); return false; }
}

let isConnected = false;

// ---------------------------------------------------------------------------
// DYNAMIC MODEL HELPER
// ---------------------------------------------------------------------------
function getModel(sessionId, type) {
    const prefix = sessionId || 'muzammil_session';
    // Use dot notation for collection to get folder view in Compass
    const collectionName = `${prefix}.${type.toLowerCase()}`;
    // Model name can be anything unique
    const modelName = `${prefix}_${type}`;

    if (mongoose.models[modelName]) return mongoose.models[modelName];

    switch (type) {
        case 'Toggle': return mongoose.model(modelName, muzammil_toggleSchema, collectionName);
        case 'UserSettings': return mongoose.model(modelName, muzammil_userSettingsSchema, collectionName);
        case 'AutoReply': return mongoose.model(modelName, muzammil_autoReplySchema, collectionName);
        case 'SessionIndex': return mongoose.model(modelName, muzammil_sessionIndexSchema, collectionName);
        case 'Bgm': return mongoose.model(modelName, muzammil_bgmSchema, collectionName);
        case 'BgmConfig': return mongoose.model(modelName, muzammil_bgmConfigSchema, collectionName);
        case 'Mention': return mongoose.model(modelName, muzammil_mentionSchema, collectionName);
        case 'MentionConfig': return mongoose.model(modelName, muzammil_mentionConfigSchema, collectionName);
        case 'BotConfig': return mongoose.model(modelName, muzammil_botConfigSchema, collectionName);
        case 'GroupSettings': return mongoose.model(modelName, muzammil_groupSettingsSchema, collectionName);
        case 'Rank': return mongoose.model(modelName, muzammil_rankSchema, collectionName);
        default: throw new Error(`Unknown model type: ${type}`);
    }
}
// ---------------------------------------------------------------------------
// BOT CONFIG MANAGEMENT
// ---------------------------------------------------------------------------
async function muzammil_getBotConfig(sessionId) {
    if (!isConnected) return null;
    try {
        const Model = getModel(sessionId, 'BotConfig');
        let config = await Model.findOne({});
        if (!config) {
            config = await Model.create({}); // Create defaults if missing
        }
        return config;
    } catch (e) {
        console.error('DB Error getBotConfig:', e);
        return null;
    }
}

async function muzammil_updateBotConfig(sessionId, updates) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'BotConfig');
        await Model.findOneAndUpdate({}, updates, { upsert: true, returnDocument: 'after' });
        return true;
    } catch (e) {
        console.error('DB Error updateBotConfig:', e);
        return false;
    }
}



// ---------------------------------------------------------------------------
// DB CONNECTION
// ---------------------------------------------------------------------------
async function muzammil_connectDatabase(dbUrl) {
    const uri = dbUrl || process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ FATAL ERROR: No MONGODB_URI found.');
        return false;
    }

    try {
        await mongoose.connect(uri);
        isConnected = true;
        console.log('✅ Muzammil Bot: Connected to MongoDB successfully!');
        return true;
    } catch (err) {
        console.error('❌ Muzammil Bot: Failed to connect to MongoDB:', err.message);
        return false;
    }
}

function muzammil_isDbConnected() {
    return isConnected;
}

// ---------------------------------------------------------------------------
// SESSION MANAGEMENT (Multi-Tenancy)
// ---------------------------------------------------------------------------

async function muzammil_registerSession(sessionId) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'SessionIndex');
        await Model.findOneAndUpdate(
            { sessionId },
            { sessionId },
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error registerSession:', e);
        return false;
    }
}

async function muzammil_unregisterSession(sessionId) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'SessionIndex');
        await Model.findOneAndDelete({ sessionId });
        return true;
    } catch (e) {
        console.error('DB Error unregisterSession:', e);
        return false;
    }
}

async function muzammil_getAllSessions(sessionId) {
    if (!isConnected) return [];
    try {
        const Model = getModel(sessionId, 'SessionIndex');
        const sessions = await Model.find({});
        return sessions.map(s => s.sessionId);
    } catch (e) {
        console.error('DB Error getAllSessions:', e);
        return [];
    }
}

// ---------------------------------------------------------------------------
// BGM MANAGEMENT
// ---------------------------------------------------------------------------

async function muzammil_addBgm(sessionId, trigger, audioUrl, mimetype = 'audio/mp4') {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'Bgm');
        await Model.findOneAndUpdate(
            { trigger },
            { trigger, audioUrl, mimetype },
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error addBgm:', e);
        return false;
    }
}

async function muzammil_deleteBgm(sessionId, trigger) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'Bgm');
        const res = await Model.findOneAndDelete({ trigger });
        return !!res;
    } catch (e) {
        console.error('DB Error deleteBgm:', e);
        return false;
    }
}

async function muzammil_getBgm(sessionId, trigger) {
    if (!isConnected) return null;
    try {
        const Model = getModel(sessionId, 'Bgm');
        const bgm = await Model.findOne({ trigger });
        // Return object structure
        return bgm ? { url: bgm.audioUrl, mimetype: bgm.mimetype || 'audio/mp4' } : null;
    } catch (e) {
        console.error('DB Error getBgm:', e);
        return null;
    }
}

async function muzammil_getAllBgms(sessionId) {
    if (!isConnected) return [];
    try {
        const Model = getModel(sessionId, 'Bgm');
        return await Model.find({});
    } catch (e) {
        console.error('DB Error getAllBgms:', e);
        return [];
    }
}

async function muzammil_toggleBgm(sessionId, status) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'BgmConfig');
        await Model.findOneAndUpdate(
            {},
            { isEnabled: status },
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error toggleBgm:', e);
        return false;
    }
}

async function muzammil_isBgmEnabled(sessionId) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'BgmConfig');
        const conf = await Model.findOne({});
        return conf ? conf.isEnabled : true;
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// MENTION REPLY MANAGEMENT
// ---------------------------------------------------------------------------

async function muzammil_setMention(sessionId, data) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'Mention');
        // We only store ONE mention reply setting for simplicity like BGM config
        await Model.deleteMany({});
        await Model.create(data);
        return true;
    } catch (e) {
        console.error('DB Error setMention:', e);
        return false;
    }
}

async function muzammil_getMention(sessionId) {
    if (!isConnected) return null;
    try {
        const Model = getModel(sessionId, 'Mention');
        return await Model.findOne({});
    } catch (e) {
        return null;
    }
}

async function muzammil_toggleMention(sessionId, status) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'MentionConfig');
        await Model.findOneAndUpdate({}, { isEnabled: status }, { upsert: true, returnDocument: 'after' });
        return true;
    } catch (e) {
        return false;
    }
}

async function muzammil_isMentionEnabled(sessionId) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'MentionConfig');
        const conf = await Model.findOne({});
        return conf ? conf.isEnabled : false;
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// GROUP SETTINGS MANAGEMENT
// ---------------------------------------------------------------------------

async function muzammil_getGroupSettings(sessionId, jid) {
    if (!isConnected) return null;
    try {
        const Model = getModel(sessionId, 'GroupSettings');
        let settings = await Model.findOne({ jid });
        if (!settings) {
            settings = await Model.create({ jid });
        }
        return settings;
    } catch (e) {
        console.error('DB Error getGroupSettings:', e);
        return null;
    }
}

async function muzammil_updateGroupSettings(sessionId, jid, updates) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'GroupSettings');
        await Model.findOneAndUpdate({ jid }, updates, { upsert: true, returnDocument: 'after' });
        return true;
    } catch (e) {
        console.error('DB Error updateGroupSettings:', e);
        return false;
    }
}

// ---------------------------------------------------------------------------
// COMMANDS / ETC
// ---------------------------------------------------------------------------

async function muzammil_isCommandEnabled(sessionId, jid, command) {
    if (!isConnected) return true;
    try {
        const Model = getModel(sessionId, 'Toggle');
        const toggle = await Model.findOne({ jid, command });
        return toggle ? toggle.isEnabled : true;
    } catch (e) {
        console.error('DB Error:', e);
        return true;
    }
}

async function muzammil_toggleCommand(sessionId, jid, command, status) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'Toggle');
        await Model.findOneAndUpdate(
            { jid, command },
            { isEnabled: status },
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error:', e);
        return false;
    }
}

async function muzammil_getUserAutoStatus(sessionId, jid) {
    if (!isConnected) return null;
    try {
        const Model = getModel(sessionId, 'UserSettings');
        const settings = await Model.findOne({ jid });
        return settings;
    } catch (e) {
        console.error('DB Error:', e);
        return null;
    }
}

async function muzammil_setUserAutoStatus(sessionId, jid, settings) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'UserSettings');
        await Model.findOneAndUpdate(
            { jid },
            settings,
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error:', e);
        return false;
    }
}

async function muzammil_getAllAutoStatusUsers(sessionId) {
    if (!isConnected) return [];
    try {
        const Model = getModel(sessionId, 'UserSettings');
        const users = await Model.find({ autoStatusSeen: true });
        return users.map(u => u.jid);
    } catch (e) {
        console.error('DB Error:', e);
        return [];
    }
}

async function muzammil_getAutoReplies(sessionId) {
    if (!isConnected) return [];
    try {
        const Model = getModel(sessionId, 'AutoReply');
        const replies = await Model.find({});
        return replies.map(r => ({ trigger: r.trigger, reply: r.reply }));
    } catch (e) {
        console.error('DB Error:', e);
        return [];
    }
}

async function muzammil_saveAutoReplies(sessionId, replies) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'AutoReply');
        await Model.deleteMany({}); // Clear existing
        if (replies && replies.length > 0) {
            await Model.insertMany(replies);
        }
        return true;
    } catch (e) {
        console.error('DB Error:', e);
        return false;
    }
}

async function muzammil_addAutoReply(sessionId, trigger, reply) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'AutoReply');
        await Model.findOneAndUpdate(
            { trigger },
            { trigger, reply },
            { upsert: true, returnDocument: 'after' }
        );
        return true;
    } catch (e) {
        console.error('DB Error addAutoReply:', e);
        return false;
    }
}

async function muzammil_deleteAutoReply(sessionId, trigger) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'AutoReply');
        await Model.findOneAndDelete({ trigger });
        return true;
    } catch (e) {
        console.error('DB Error deleteAutoReply:', e);
        return false;
    }
}

// ---------------------------------------------------------------------------
// RANK / XP SYSTEM
// ---------------------------------------------------------------------------

async function muzammil_getXP(sessionId, jid) {
    if (!isConnected) return { xp: 0, level: 0, role: 'Novice' };
    try {
        const Model = getModel(sessionId, 'Rank');
        let user = await Model.findOne({ jid });
        if (!user) user = await Model.create({ jid, xp: 0, level: 0, role: 'Novice' });
        return user;
    } catch (e) {
        console.error('DB Error getXP:', e);
        return { xp: 0, level: 0, role: 'Novice' };
    }
}

async function muzammil_addXP(sessionId, jid, amount) {
    if (!isConnected) return false;
    try {
        const Model = getModel(sessionId, 'Rank');
        let user = await Model.findOne({ jid });
        if (!user) user = await Model.create({ jid, xp: 0, level: 0 });

        user.xp += amount;
        // Simple Level Up Formula: Level = sqrt(XP / 100)
        // Or XP needed = Level * Level * 100
        const newLevel = Math.floor(Math.sqrt(user.xp / 100));

        let leveledUp = false;
        if (newLevel > user.level) {
            user.level = newLevel;
            leveledUp = true;
            // Update Roles based on Level (Example)
            if (newLevel >= 50) user.role = 'Titan';
            else if (newLevel >= 25) user.role = 'Legend';
            else if (newLevel >= 10) user.role = 'Pro';
            else if (newLevel >= 5) user.role = 'Apprentice';
        }

        await user.save();
        return leveledUp ? newLevel : false;
    } catch (e) {
        console.error('DB Error addXP:', e);
        return false;
    }
}

async function muzammil_getLeaderboard(sessionId, limit = 10) {
    if (!isConnected) return [];
    try {
        const Model = getModel(sessionId, 'Rank');
        return await Model.find({}).sort({ xp: -1 }).limit(limit);
    } catch (e) {
        return [];
    }
}

module.exports = {
    muzammil_connectDatabase,
    muzammil_isDbConnected,
    muzammil_isCommandEnabled,
    muzammil_toggleCommand,
    muzammil_getUserAutoStatus,
    muzammil_setUserAutoStatus,
    muzammil_getAllAutoStatusUsers,
    muzammil_getAutoReplies,
    muzammil_saveAutoReplies,
    muzammil_addAutoReply,
    muzammil_deleteAutoReply,
    muzammil_registerSession,
    muzammil_unregisterSession,
    muzammil_getAllSessions,
    muzammil_addBgm,
    muzammil_deleteBgm,
    muzammil_getBgm,
    muzammil_getAllBgms,
    muzammil_toggleBgm,
    muzammil_isBgmEnabled,
    muzammil_getBotConfig,
    muzammil_updateBotConfig,
    muzammil_setMention,
    muzammil_getMention,
    muzammil_toggleMention,
    muzammil_isMentionEnabled,
    muzammil_getGroupSettings,
    muzammil_updateGroupSettings,
    muzammil_getXP,
    muzammil_addXP,
    muzammil_getLeaderboard,
    // FSR config
    muzammil_getFsrConfig,
    muzammil_saveFsrConfig
};
