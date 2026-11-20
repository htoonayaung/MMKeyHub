import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { startTelegramBot, stopTelegramBot } from './bot/bot.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { adminRouter } from './routes/admin.js';
import { ordersRouter } from './routes/orders.js';
import { paymentMethodsRouter } from './routes/paymentMethods.js';
import { productsRouter } from './routes/products.js';
import { promoRouter } from './routes/promo.js';
import { webhooksRouter } from './routes/webhooks.js';
import { startExpirationWorker, stopExpirationWorker } from './services/expirationWorker.js';

export async function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
    })
  );
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'disconnected' });
    }
  });

  app.use('/api', adminRouter);
  app.use('/api', productsRouter);
  app.use('/api', promoRouter);
  app.use('/api', ordersRouter);
  app.use('/api', paymentMethodsRouter);
  app.use('/api', webhooksRouter);

  // Register Telegram webhook (if configured) or start long polling
  await startTelegramBot(app);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Unhandled Error]:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function bootstrap() {
  const app = await createApp();
  startExpirationWorker();

  const server = app.listen(env.API_PORT, () => {
    console.log(`[MMKeyHub API] Listening on port ${env.API_PORT}`);
  });

  async function shutdown(signal: string) {
    console.log(`[MMKeyHub API] Received ${signal}, closing gracefully...`);
    stopExpirationWorker();
    await stopTelegramBot();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
