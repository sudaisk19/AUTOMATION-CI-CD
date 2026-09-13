import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  baseUrl: process.env.BASE_URL || 'https://opensource-demo.orangehrmlive.com',
  adminUser: process.env.ADMIN_USER || 'Admin',
  adminPass: process.env.ADMIN_PASS || 'admin123',
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || 'logs',
};

export function getConfig() {
  return { ...config };
}

export function getBaseUrl() {
  return config.baseUrl;
}

export function getAdminCredentials() {
  return { username: config.adminUser, password: config.adminPass };
}

export default config;
