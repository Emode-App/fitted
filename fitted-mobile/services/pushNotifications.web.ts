export async function registerForPush(_userId: string): Promise<boolean> {
    return false;
}

export function addNotificationResponseListener(
    _handler: (data: Record<string, any>) => void,
): () => void {
    return () => {};
}

export async function unregisterPush(): Promise<void> {}

export async function syncPushToken(_userId: string): Promise<void> {}

/** No such thing as an app icon badge on the web. */
export async function setAppIconBadge(_count: number): Promise<void> {}
