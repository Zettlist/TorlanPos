/**
 * Middleware: API Key Authentication
 * Verifies the x-api-key header against the EXTERNAL_API_KEY environment variable.
 */
const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.EXTERNAL_API_KEY;

    if (!expectedKey) {
        console.error('❌ EXTERNAL_API_KEY is not defined in environment variables.');
        return res.status(500).json({
            error: 'Server configuration error: API security missing.'
        });
    }

    if (!apiKey || apiKey !== expectedKey) {
        console.warn(`⚠️  Unauthorized API access attempt. Received: ${apiKey || 'None'}`);
        return res.status(401).json({
            error: 'Unauthorized: Invalid or missing API Key'
        });
    }

    next();
};

export default apiKeyAuth;
