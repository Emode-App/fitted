import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme() {
  // Default to light mode
  return useRNColorScheme() ?? 'light';
}