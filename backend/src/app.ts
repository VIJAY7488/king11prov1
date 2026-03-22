import express, { Application } from 'express';
import routes from './routes';
import cors from 'cors'
import cookieParser from "cookie-parser";
import errorHandler from './middlewares/error.middleware';
import config from './config/env';

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/+$/, '').toLowerCase();

const createApp = ():Application => {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());

    const allowedOrigins = new Set(
      [
        ...config.corsOrigins,
        'https://king11pro.live',
        'https://www.king11pro.live',
      ].map(normalizeOrigin)
    );

    const corsDelegate: cors.CorsOptions = {
      origin: (origin, callback) => {
        // Allow server-to-server and non-browser requests with no Origin header.
        if (!origin) return callback(null, true);

        const normalized = normalizeOrigin(origin);
        if (allowedOrigins.has(normalized)) return callback(null, true);

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      optionsSuccessStatus: 204,
    };

    app.use(
        cors(corsDelegate)
    );
    app.use(cors(corsDelegate));



    // ── Routes ──────────────────────────────────────────────────────
    app.use('/api/v1', routes);
    app.use(errorHandler);

    return app;
}

export default createApp;
