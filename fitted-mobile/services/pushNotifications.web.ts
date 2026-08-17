export async function registerForPush(_userId: string): Promise<boolean> {
    return false;
}

export function addNotificationResponseListener(
    _handler: (data: Record<string, any>) => void,
): () => void {
    return () => {};
}

export async function unregisterPush(): Promise<void> {}
