import { Request } from 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
      name: string;
    }
    
    interface Request {
      user?: User;
    }
  }
}
