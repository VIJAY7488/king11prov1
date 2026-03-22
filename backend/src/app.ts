import express, { Application } from 'express';
import routes from './routes';
import cors from 'cors'
import cookieParser from "cookie-parser";
import errorHandler from './middlewares/error.middleware';
import config from './config/env';


const createApp = ():Application => {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());

    app.use(
        cors({
          origin: (origin, callback) => {
            // Allow server-to-server and non-browser requests with no Origin header.
            if (!origin) return callback(null, true);
            if (config.corsOrigins.includes(origin)) return callback(null, true);
            return callback(new Error(`CORS blocked for origin: ${origin}`));
          },
          credentials: true,
        })
    );



    // ── Routes ──────────────────────────────────────────────────────
    app.use('/api/v1', routes);
    app.use(errorHandler);

    return app;
}

export default createApp;
