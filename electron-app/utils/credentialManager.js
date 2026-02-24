// electron-app/utils/credentialManager.js
// Manages secure credential storage using keytar (OS-native secure storage)

const keytar = require('keytar');

const SERVICE_NAME = 'SportsData-Pro-Desktop';

class CredentialManager {
  /**
   * Store Oracle credentials securely
   * @param {string} username - Oracle username
   * @param {string} password - Oracle password
   */
  async storeOracleCredentials(username, password) {
    try {
      await keytar.setPassword(SERVICE_NAME, `oracle_username`, username);
      await keytar.setPassword(SERVICE_NAME, username, password);
      console.log('✅ Oracle credentials stored securely');
      return true;
    } catch (error) {
      console.error('❌ Error storing Oracle credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieve Oracle credentials
   * @returns {Object|null} { username, password } or null if not found
   */
  async getOracleCredentials() {
    try {
      const username = await keytar.getPassword(SERVICE_NAME, 'oracle_username');
      if (!username) {
        return null;
      }

      const password = await keytar.getPassword(SERVICE_NAME, username);
      if (!password) {
        return null;
      }

      return { username, password };
    } catch (error) {
      console.error('❌ Error retrieving Oracle credentials:', error);
      return null;
    }
  }

  /**
   * Delete stored Oracle credentials (logout)
   */
  async clearOracleCredentials() {
    try {
      const username = await keytar.getPassword(SERVICE_NAME, 'oracle_username');
      if (username) {
        await keytar.deletePassword(SERVICE_NAME, username);
        await keytar.deletePassword(SERVICE_NAME, 'oracle_username');
        console.log('✅ Oracle credentials cleared');
      }
      return true;
    } catch (error) {
      console.error('❌ Error clearing Oracle credentials:', error);
      throw error;
    }
  }

  /**
   * Check if credentials are stored
   * @returns {boolean}
   */
  async hasStoredCredentials() {
    try {
      const username = await keytar.getPassword(SERVICE_NAME, 'oracle_username');
      return username !== null;
    } catch (error) {
      console.error('❌ Error checking stored credentials:', error);
      return false;
    }
  }
}

module.exports = new CredentialManager();
