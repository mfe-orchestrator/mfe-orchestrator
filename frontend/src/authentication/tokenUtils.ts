export const TOKEN_KEY = 'token';

export interface IToken {
  token: string;
  issuer: string;
}

export const setToken = (token: string, issuer: string): void => {
  if (typeof window === 'undefined') {
    console.warn('LocalStorage is not available in this environment');
    return;
  }

  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({token, issuer}));
  } catch (error) {
    console.error('Error storing token in localStorage:', error);
  }
};

export const getToken = (): IToken | null => {
  if (typeof window === 'undefined') {
    console.warn('LocalStorage is not available in this environment');
    return null;
  }

  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch (error) {
    console.error('Error retrieving token from localStorage:', error);
    return null;
  }
};

export const deleteToken = (): void => {
  if (typeof window === 'undefined') {
    console.warn('LocalStorage is not available in this environment');
    return;
  }

  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error removing token from localStorage:', error);
  }
};