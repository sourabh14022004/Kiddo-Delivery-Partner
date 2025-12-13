import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../config/theme';

interface Tab {
  name: string;
  icon: string;
  label: string;
}

interface CustomTabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabPress: (tabName: string) => void;
}

const CustomTabBar: React.FC<CustomTabBarProps> = ({
  tabs,
  activeTab,
  onTabPress,
}) => {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tabItem}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabIcon,
                isActive && styles.tabIconActive,
              ]}
            >
              {tab.icon}
            </Text>
            <Text
              style={[
                styles.tabLabel,
                isActive && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.primary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primaryDark,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    height: 60,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: theme.spacing.xs,
    opacity: 0.7,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: theme.colors.textLight,
    opacity: 1,
    fontWeight: '600',
  },
});

export default CustomTabBar;
