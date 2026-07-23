require('dotenv').config();

module.exports = {
    sessionId: process.env.SESSION_ID || '',
    mongoDbUrl: process.env.MONGODB_URI || process.env.MONGODB_URL || '',

    // Auth / dashboard
    jwtSecret: process.env.JWT_SECRET || 'muzammil-md-v3-change-this-secret',

    // Company branding for the FSR (Field Service Report) tool
    companyName: process.env.COMPANY_NAME || 'HNL Hi-Tech (Pvt) Ltd'
};
