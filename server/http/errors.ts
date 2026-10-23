export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} no existe.`);
export const forbidden = (msg = 'Tu rol no permite esta acción.') => new AppError(403, 'forbidden', msg);
export const invalid = (msg: string, details?: unknown) => new AppError(422, 'invalid', msg, details);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'conflict', msg, details);
