const {
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./muzammil');
const { useMongoDBAuthState } = require('./mongoAuth');

async function muzammil_connectSession(usePairingCode = false, customSessionId = null) {
    // -------------------------------------------------------------------------
    // Use MongoDB Auth State directly
    // This removes the dependency on the local file system which is ephemeral on Heroku.
    // -------------------------------------------------------------------------

    // Support multi-tenancy by using a custom session ID if provided
    const sessionId = customSessionId || config.sessionId || 'muzammil_session';
    console.log(`🔌 Connecting to session: ${sessionId}`);

    const { state, saveCreds } = await useMongoDBAuthState(sessionId);

    let version;
    try {
        const v = await fetchLatestWaWebVersion();
        version = v.version;
    } catch (e) {
        version = [2, 3000, 1017531287];
    }

    const socketOptions = {
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            // Wrap keys with makeCacheableSignalKeyStore for better performance
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        retryRequestDelayMs: 5000,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 60000,
    };

    const muzammil_sock = makeWASocket(socketOptions);

    return { muzammil_sock, saveCreds };
}

async function muzammil_clearSession(customSessionId = null) {
    const sessionId = customSessionId || config.sessionId || 'muzammil_session';
    const { useMongoDBAuthState } = require('./mongoAuth');

    // Instantiate with the specific session ID to get the correct model
    const { clearState } = await useMongoDBAuthState(sessionId);
    if (clearState) {
        await clearState();
        console.log(`🗑️ Session cleared from MongoDB: ${sessionId}`);
    }
}

module.exports = { muzammil_connectSession, muzammil_clearSession };
