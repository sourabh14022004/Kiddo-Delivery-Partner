import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../config/theme';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading...',
  fullScreen = false,
}) => {
  return (
    <View style={fullScreen ? styles.fullScreen : styles.container}>
      <ActivityIndicator size="large" color={theme.colors.success} />
      {message && <Text style={styles.text}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.xxl,
  },
  text: {
    ...theme.typography.body,
    color: theme.colors.success,
    marginTop: theme.spacing.md,
  },
});

export default LoadingScreen;

