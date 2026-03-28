import express, { Application } from 'express';
import routes from './routes';
import cors from 'cors';
import cookieParser from "cookie-parser";
import errorHandler from './middlewares/error.middleware';

const createApp = (): Application => {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());

    app.use(cors({
        origin: [
            'https://king11pro.live',
            'https://www.king11pro.live'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Routes
    app.use('/api/v1', routes);

    // Error Handler
    app.use(errorHandler);

    return app;
}

export default createApp;