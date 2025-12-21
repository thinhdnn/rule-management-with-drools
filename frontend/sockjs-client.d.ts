declare module 'sockjs-client' {
  class SockJS {
    constructor(url: string, _reserved?: any, options?: any);
    onopen: ((e: Event) => void) | null;
    onmessage: ((e: MessageEvent) => void) | null;
    onclose: ((e: CloseEvent) => void) | null;
    onerror: ((e: Event) => void) | null;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
  export = SockJS;
}

