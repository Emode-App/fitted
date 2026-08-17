import * as SecureStore from 'expo-secure-store';

export const getSecureItem = (key: string) => SecureStore.getItemAsync(key);
export const setSecureItem = (key: string, value: string) => SecureStore.setItemAsync(key, value);
export const deleteSecureItem = (key: string) => SecureStore.deleteItemAsync(key);
