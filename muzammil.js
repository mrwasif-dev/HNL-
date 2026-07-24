require('dotenv').config();

module.exports = {
    sessionId: process.env.SESSION_ID || '',
    mongoDbUrl: process.env.MONGODB_URI || process.env.MONGODB_URL || '',

    // Auth
    jwtSecret: process.env.JWT_SECRET || 'hnl-hitech-fsr-change-this-secret',

    // Only these ERP IDs may log in. Comma-separated, e.g. "1007015,1315964".
    // Add more any time from Heroku → Settings → Config Vars.
    erpIds: (process.env.ERP_IDS || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),

    // Shared password used by every ERP ID above.
    erpPassword: process.env.ERP_PASSWORD || '1234hnl'
};
