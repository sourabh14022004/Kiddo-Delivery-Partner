/**
 * Design System Theme
 * Based on TheKitchen~ reference UI
 */

export const colors = {
  // Primary colors
  primary: '#000000',
  primaryDark: '#1a1a1a',
  secondary: '#4CAF50',
  
  // Background colors
  background: '#FFFFFF',
  backgroundLight: '#F5F5F5',
  backgroundDark: '#000000',
  
  // Text colors
  textPrimary: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textLight: '#FFFFFF',
  
  // Accent colors
  accent: '#007AFF',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
  
  // Border colors
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  
  // Badge colors
  badgeGreen: '#4CAF50',
  badgeRed: '#F44336',
  badgeBlue: '#2196F3',
  badgeOrange: '#FF9800',
  
  // Card colors
  cardBackground: '#FFFFFF',
  cardShadow: 'rgba(0, 0, 0, 0.1)',
};

export const typography = {
  // Font sizes
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 20,
  round: 9999,
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
};
