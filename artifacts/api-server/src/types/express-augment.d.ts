declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      businessId?: string;
    }
  }
}

export {};
