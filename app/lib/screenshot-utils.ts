import { Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { debugLog } from './server-utils';

interface ScreenshotConfig {
  interval: number;  // milliseconds between screenshots
  maxDuration: number;  // maximum duration to take screenshots
  outputDir: string;  // directory to save screenshots
  prefix: string;  // prefix for screenshot filenames
}

export class ScreenshotRecorder {
  private intervalId: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private screenshotCount: number = 0;
  private isRecording: boolean = false;

  constructor(private page: Page, private config: ScreenshotConfig) {
    // Ensure output directory exists
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    if (this.isRecording) {
      debugLog('Screenshot recording already in progress');
      return;
    }

    this.isRecording = true;
    this.startTime = Date.now();
    this.screenshotCount = 0;

    debugLog('Starting screenshot recording');
    
    this.intervalId = setInterval(async () => {
      try {
        if (Date.now() - this.startTime >= this.config.maxDuration) {
          await this.stop();
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${this.config.prefix}_${timestamp}_${this.screenshotCount}.png`;
        const filepath = path.join(this.config.outputDir, filename);

        await this.page.screenshot({
          path: filepath,
          fullPage: false,
          type: 'png'
        });

        this.screenshotCount++;
        debugLog(`Captured screenshot ${this.screenshotCount}: ${filename}`);
      } catch (error) {
        debugLog('Error capturing screenshot: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }, this.config.interval);
  }

  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRecording = false;
    debugLog(`Screenshot recording stopped. Captured ${this.screenshotCount} screenshots`);
  }
}

export async function captureVerificationProcess(
  page: Page, 
  outputDir: string = 'verification_screenshots',
  interval: number = 3000,  // 3 seconds
  maxDuration: number = 20000  // 20 seconds
): Promise<() => Promise<void>> {
  const recorder = new ScreenshotRecorder(page, {
    interval,
    maxDuration,
    outputDir,
    prefix: 'verification'
  });

  await recorder.start();
  return () => recorder.stop();
} 