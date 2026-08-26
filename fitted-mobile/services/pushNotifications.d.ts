export function registerForPush(userId: string): Promise<boolean>;
/** Rebind this device's token to the signed-in user. Never prompts. */
export function syncPushToken(userId: string): Promise<void>;
export function addNotificationResponseListener(
    handler: (data: Record<string, any>) => void,
): () => void;
export function unregisterPush(): Promise<void>;
export function setAppIconBadge(count: number): Promise<void>;
