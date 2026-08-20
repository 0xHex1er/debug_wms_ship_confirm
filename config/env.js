/**
 * Get environment file path based on NODE_ENV
 * @returns {string} Path to environment file
 */
function getEnvFile() {
    if (process.env.NODE_ENV === 'production') {
        return '.env.production';
    } else if (process.env.NODE_ENV === 'local') {
        return '.env.local';
    } else {
        return '.env.development';
    }
}

module.exports = {
    getEnvFile
};
