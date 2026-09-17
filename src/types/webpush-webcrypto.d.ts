declare module "webpush-webcrypto" {
  export class ApplicationServerKeys {
    static fromJSON(keys: {
      publicKey: string;
      privateKey: string;
    }): Promise<ApplicationServerKeys>;
    static generate(): Promise<ApplicationServerKeys>;
    toJSON(): Promise<{ publicKey: string; privateKey: string }>;
  }

  export function generatePushHTTPRequest(options: {
    applicationServerKeys: ApplicationServerKeys;
    payload: string;
    target: { endpoint: string; keys: { p256dh: string; auth: string } };
    adminContact: string;
    ttl?: number;
    urgency?: string;
  }): Promise<{
    headers: Record<string, string>;
    body: ArrayBuffer | Uint8Array;
    endpoint: string;
  }>;
}
