export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "Item") => new ApiError(404, `${what} niet gevonden`);
export const forbidden = (msg = "Je hebt geen toestemming voor deze actie") => new ApiError(403, msg);
export const badRequest = (msg: string, details?: Record<string, unknown>) => new ApiError(400, msg, details);

/** Fout die aangeeft dat een verbinding/API-sleutel nog ingesteld moet worden. */
export class ConfigurationError extends ApiError {
  constructor(message: string, public setup: { provider: string; where: string }) {
    super(424, message, { setup });
    this.name = "ConfigurationError";
  }
}
