import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'joi';
import AppError from '../utils/AppError';



type ValidationTarget = 'body' | 'query' | 'params';

const validate = 
    (schema: ObjectSchema, target: ValidationTarget = 'body') => (req: Request, res:Response, next: NextFunction): void => {

        // Ensure body exists
        if (!req[target]) {
            return next(new AppError('Request body is missing.', 400));
        }


        const { error, value } = schema.validate(req[target], {
            abortEarly: false, // collect all errors, not just the first
            stripUnknown: true  // drop undeclared keys
        });

        if(error) {
            const message = error.details.map((d) => d.message).join('; ');
            return next(new AppError(message, 422));
        }

        // In Express 5, req.query may be exposed via a getter-only property.
        // Reassigning req.query throws, so we mutate the existing object instead.
        if (target === 'query' || target === 'params') {
            const container = req[target] as Record<string, unknown>;
            for (const key of Object.keys(container)) {
                delete container[key];
            }
            Object.assign(container, value);
        } else {
            req[target] = value; // safe for body
        }
        next();
};

export default validate;
