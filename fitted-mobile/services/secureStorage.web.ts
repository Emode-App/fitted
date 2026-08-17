import AsyncStorage from '@react-native-async-storage/async-storage';

// Browser storage cannot provide Keychain/Keystore guarantees. Supabase already
// persists the auth token; this key is only a non-secret login-session row id.
export const getSecureItem = (key: string) => AsyncStorage.getItem(key);
export const setSecureItem = (key: string, value: string) => AsyncStorage.setItem(key, value);
export const deleteSecureItem = (key: string) => AsyncStorage.removeItem(key);
