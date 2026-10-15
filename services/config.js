// App configuration. Values come from the root .env file (see .env.example).
// Expo exposes variables that start with EXPO_PUBLIC_ to the app.

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Breakpoints for phone / tablet / desktop-web layouts
export const BREAKPOINTS = { tablet: 700, desktop: 1024 };
