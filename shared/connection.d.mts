export class Connection {
  constructor(
    base: string,
    credentials: any,
    onMessage: (message: any) => void,
    onStatus?: (status: string) => void,
  );
  send(message: any): boolean;
  close(): void;
}
export function request(base: string, path: string, data: any): Promise<any>;
export function commandId(): string;
