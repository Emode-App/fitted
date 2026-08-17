export function registerForPush(userId: string): Promise<boolean>;
export function addNotificationResponseListener(
    handler: (data: Record<string, any>) => void,
): () => void;
export function unregisterPush(): Promise<void>;
