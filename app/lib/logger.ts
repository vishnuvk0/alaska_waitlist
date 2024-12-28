import { writeFile } from 'fs/promises';
import { join } from 'path';

class Logger {
  private static instance: Logger;
  private logQueue: string[] = [];
  private isProcessing = false;
  private logPath: string;

  private constructor() {
    // Use process.cwd() to get the project root directory
    this.logPath = join(process.cwd(), 'logs', 'app.log');
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async processQueue() {
    if (this.isProcessing || this.logQueue.length === 0) return;

    this.isProcessing = true;
    const logs = this.logQueue.join('\n') + '\n';
    this.logQueue = [];

    try {
      await writeFile(this.logPath, logs, { flag: 'a' });
    } catch (error) {
      console.error('Failed to write to log file:', error);
    } finally {
      this.isProcessing = false;
      if (this.logQueue.length > 0) {
        await this.processQueue();
      }
    }
  }

  public async log(message: string, level: 'info' | 'error' | 'debug' = 'info'): Promise<void> {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Always log to console
    console.log(formattedMessage);

    // Only write to file in production or if explicitly enabled
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
      this.logQueue.push(formattedMessage);
      await this.processQueue();
    }
  }
}

export const logger = Logger.getInstance();