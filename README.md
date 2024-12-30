# Alaska Airlines Waitlist Tracker

A Next.js application that helps track your position on Alaska Airlines upgrade waitlists. The app provides real-time tracking of your upgrade status, waitlist position, and first-class seat availability.

## Features

- Real-time waitlist position tracking
- First Class seat availability monitoring
- Elite status tracking (MVP, MVP Gold, MVP Gold 75K)
- Multi-segment flight support
- Auto refresh

## Tech Stack

- **Frontend:**
  - Next.js 14
  - React
  - Tailwind CSS
  - shadcn/ui components
  - TypeScript

- **Backend:**
  - Next.js API routes
  - SQLite database
  - Puppeteer for web scraping
  - Rate limiting

## Prerequisites

Before running the application, ensure you have the following installed:

1. Node.js (v18 or higher)
2. Chrome/Chromium browser
3. Required system dependencies for Puppeteer (Linux/Ubuntu):
   ```bash
   sudo yum install -y \
       pango \
       libXcomposite \
       libXcursor \
       libXdamage \
       libXext \
       libXi \
       libXtst \
       cups-libs \
       libXScrnSaver \
       libXrandr \
       alsa-lib \
       atk \
       gtk3 \
       nss \
       at-spi2-atk \
       at-spi2-core \
       liberation-fonts \
       mesa-libgbm \
       xdg-utils
   ```

4. Chrome browser:
   ```bash
   sudo curl -o /tmp/chrome-linux.rpm https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
   sudo yum install -y /tmp/chrome-linux.rpm
   ```

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd alaska-waitlist
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

   Or for production:
   ```bash
   npm run start
   ```

## Production Deployment

For production deployment (e.g., on AWS EC2):

1. Install PM2 globally:
   ```bash
   npm install -pm2 -g
   ```

2. Start the application with PM2:
   ```bash
   pm2 start ecosystem.config.cjs
   ```

3. Save PM2 process list and configure startup:
   ```bash
   pm2 save
   pm2 startup
   ```

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:
```env
NODE_ENV=development
PORT=3000
```

## Database

The application uses SQLite for data storage. The database file (`alaska_waitlist.db`) will be automatically created in the root directory when the application starts.

## Project Structure

- `/app` - Next.js application routes and components
  - `/api` - API routes for waitlist tracking and authentication
  - `/components` - React components
  - `/lib` - Utility functions and database operations
- `/public` - Static assets
- `/scripts` - Database management scripts

## Development

1. Run in development mode:
   ```bash
   npm run dev
   ```

2. Run linting:
   ```bash
   npm run lint
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Troubleshooting

1. **Puppeteer Issues:**
   - Ensure Chrome/Chromium is installed
   - Check system dependencies
   - Verify proper permissions for Chrome execution

2. **Database Issues:**
   - Ensure write permissions in the project directory
   - Check SQLite installation
   - Use the database CLI tool: `node scripts/db-cli.ts`

3. **Network Issues:**
   - Verify network access to Alaska Airlines website
   - Check for rate limiting
   - Ensure proper security group settings if running on AWS

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
