import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'random_secret_123',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false, // Set to true if using HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Auth URL Helper
  const getAuthClient = () => {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.APP_URL}/auth/callback`
    );
  };

  // Auth URL
  app.get('/api/auth/google/url', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ 
        error: 'Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' 
      });
    }

    const oauth2Client = getAuthClient();
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    res.json({ url });
  });

  // OAuth Callback
  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');

    const oauth2Client = getAuthClient();
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      (req.session as any).tokens = tokens;
      
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fdfcfb;">
            <div style="background: white; padding: 2rem; border-radius: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); text-align: center;">
              <h1 style="color: #4f46e5; margin-bottom: 1rem;">授權成功！</h1>
              <p style="color: #6b7280;">正在為您連結 Google 帳號，視窗即將關閉...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth error:', error);
      res.status(500).send('Authentication failed. Please check your credentials and try again.');
    }
  });

  // Export to Google Sheets
  app.post('/api/export/google-sheets', async (req, res) => {
    const tokens = (req.session as any).tokens;
    if (!tokens) {
      return res.status(401).json({ error: 'Unauthorized. Please login to Google first.' });
    }

    const { groups, title } = req.body;
    if (!groups || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const oauth2Client = getAuthClient();
    try {
      oauth2Client.setCredentials(tokens);
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      
      // 1. Create a new spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: title || `分組結果_${new Date().toLocaleDateString()}`
          }
        }
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId;

      // 2. Prepare data
      const values = [['組別', '姓名', '性別']];
      groups.forEach((g: any) => {
        g.members.forEach((m: any) => {
          values.push([
            g.id.toString(),
            m.name,
            m.gender === 'M' ? '男' : m.gender === 'F' ? '女' : '-'
          ]);
        });
      });

      // 3. Write data
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId!,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values
        }
      });

      res.json({ 
        success: true, 
        spreadsheetId, 
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` 
      });

    } catch (error: any) {
      console.error('Sheets error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auth Status
  app.get('/api/auth/google/status', (req, res) => {
    res.json({ isAuthenticated: !!(req.session as any).tokens });
  });

  // Logout
  app.post('/api/auth/google/logout', (req, res) => {
    (req.session as any).tokens = null;
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Basic production setup
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
