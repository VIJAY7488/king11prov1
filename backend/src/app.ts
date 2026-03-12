import express, { Application } from 'express';
import routes from './routes';
import cors from 'cors'
import cookieParser from "cookie-parser";


const createApp = ():Application => {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());

    app.use(
        cors({
          origin: "https://king11pro.live",
          credentials: true,
        })
    );



    // ── Routes ──────────────────────────────────────────────────────
    app.use('/api/v1', routes);

    return app;
}

export default createApp;
