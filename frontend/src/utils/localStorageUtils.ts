
export const setLanguageInLocalStorage = (language: string) => {
    if(!localStorage) return
    localStorage.setItem('language', language);
}

export const setThemeInLocalStorage = (theme: string) => {
    if(!localStorage) return
    localStorage.setItem('theme', theme);
}

export const getLanguageFromLocalStorage = () => {
    if(!localStorage) return
    return localStorage.getItem('language');
}

export const getThemeFromLocalStorage = () => {
    if(!localStorage) return
    return localStorage.getItem('theme');
}