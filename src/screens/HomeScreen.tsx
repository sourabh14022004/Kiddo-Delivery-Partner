import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { PickerDetails } from './PickerDetailsScreen';
import { fetchOrders, ShopifyOrder } from '../services/shopifyService';
import {
  syncShopifyOrderToFirestore,
  assignOrderToRider,
  batchCheckOrderAssignments,
} from '../services/orderService';
import { startLocationTracking } from '../services/locationService';
import { storageService } from '../services/storageService';
import LoadingScreen from '../components/LoadingScreen';
import { theme } from '../config/theme';
import { isProfileComplete, getIncompleteProfileMessage } from '../utils/profileValidation';

interface HomeScreenProps {
  phoneNumber?: string;
  pickerDetails?: PickerDetails | null;
  onOrderSelect?: (orderId: string) => void;
  onOrderPicked?: (orderId: string) => void;
  onViewOrderDetails?: (orderId: string) => void;
  refreshTrigger?: number; // Key prop from App.tsx triggers remount, but this allows soft refresh
}

const HomeScreen: React.FC<HomeScreenProps> = ({
  phoneNumber,
  pickerDetails,
  onOrderSelect,
  onOrderPicked,
  onViewOrderDetails,
  refreshTrigger,
}) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(false); // Start with false for instant UI
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const userName = pickerDetails?.fullName?.split(' ')[0] || 'Partner';
  const userLocation = 'Location';
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  // Collapsing header: nothing until scroll > 25%; then header hide + search bar shift together
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const HEADER_COLLAPSE_THRESHOLD = Math.round(windowHeight * 0.25); // exactly 25%
  const HEADER_EXPAND_THRESHOLD = Math.round(windowHeight * 0.15);
  const HEADER_ROW_HEIGHT = 120;
  const FADE_WINDOW = 50; // short fade/slide right after 25% so hide + shift feel simultaneous

  // Android: explicit height animation (LayoutAnimation is unreliable on Android)
  const headerHeightAnim = useRef(new Animated.Value(HEADER_ROW_HEIGHT)).current;
  const COLLAPSE_DURATION = 250;

  // Fade and slide only after 25%: stay visible until threshold, then hide over a short range
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_COLLAPSE_THRESHOLD, HEADER_COLLAPSE_THRESHOLD + FADE_WINDOW],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_COLLAPSE_THRESHOLD, HEADER_COLLAPSE_THRESHOLD + FADE_WINDOW],
    outputRange: [0, 0, -50],
    extrapolate: 'clamp',
  });

  // Search bar padding on Android: interpolate from header height so it animates with collapse
  const searchPaddingTopAndroid = headerHeightAnim.interpolate({
    inputRange: [0, HEADER_ROW_HEIGHT],
    outputRange: [insets.top, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    loadOrdersWithCache();
  }, []);

  // Refresh when refreshTrigger changes (from App.tsx notifications)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      // Soft refresh - show cache instantly, then update in background
      loadOrdersWithCache();
    }
  }, [refreshTrigger]);

  // PRODUCTION-GRADE: Load orders with instant cache + background refresh
  const loadOrdersWithCache = async () => {
    setIsInitialLoad(true);

    // Step 1: INSTANT - Load cached orders immediately (0ms)
    const cachedOrders = await storageService.getCachedOrders(10 * 60 * 1000); // 10 min cache
    if (cachedOrders && cachedOrders.length > 0) {
      setOrders(cachedOrders);
      setIsInitialLoad(false);
    } else {
      // No cache, show loading only on first load
      setLoading(true);
    }

    // Step 2: BACKGROUND - Fetch fresh data (non-blocking)
    loadOrders(true);
  };

  const loadOrders = async (refresh = false, skipCache = false) => {
    try {
      if (refresh && !skipCache) {
        setRefreshing(true);
      } else if (!skipCache) {
        setLoading(true);
      }
      setError(null);

      // Fetch orders from Shopify
      const res = await fetchOrders(20);
      if (!res.success || !res.data) throw new Error(res.error);

      const nodes = res.data.orders.edges
        .map((e) => e.node)
        .filter(
          (o) =>
            !o.cancelledAt &&
            o.displayFulfillmentStatus !== 'FULFILLED' &&
            o.displayFulfillmentStatus !== 'DELIVERED'
        );

      // OPTIMIZATION: Batch check all orders in parallel
      const orderIds = nodes.map(o => o.id);
      const assignmentMap = await batchCheckOrderAssignments(orderIds);

      const unassigned = nodes.filter(order => !assignmentMap.get(order.id));

      // Update UI with fresh data
      setOrders(unassigned);

      // Cache the fresh data for next time (instant loading)
      await storageService.saveCachedOrders(unassigned);
    } catch (e: any) {
      setError(e.message || 'Failed to load orders');
      // If we have cached data, keep showing it even on error
      if (orders.length === 0) {
        const cachedOrders = await storageService.getCachedOrders(24 * 60 * 60 * 1000); // 24h fallback
        if (cachedOrders) {
          setOrders(cachedOrders);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsInitialLoad(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.name?.toLowerCase().includes(q) ||
      o.shippingAddress?.address1?.toLowerCase().includes(q) ||
      o.shippingAddress?.city?.toLowerCase().includes(q)
    );
  });

  const handlePickOrder = async (order: ShopifyOrder) => {
    // ✅ Check if user is logged in
    if (!phoneNumber) {
      Alert.alert('Login Required', 'Please log in to pick orders.');
      return;
    }

    // ✅ Check if profile is complete
    if (!isProfileComplete(pickerDetails)) {
      Alert.alert(
        'Profile Incomplete',
        getIncompleteProfileMessage(),
        [
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    setPickingOrderId(order.id);
    try {
      await syncShopifyOrderToFirestore(order);
      const riderId = phoneNumber.replace(/\D/g, '');
      const res = await assignOrderToRider(order.id, riderId);

      if (!res.success) throw new Error(res.error);

      await startLocationTracking(riderId);
      onOrderPicked?.(order.id);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setPickingOrderId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* ================= HEADER (fade/slide on scroll, then collapse) + SEARCH ================= */}
      {/* No top inset here so initial position is unchanged; safe area only when collapsed */}
      <View style={styles.headerContainer} pointerEvents="box-none">
        {Platform.OS === 'android' ? (
          <Animated.View
            style={[
              styles.headerCollapseSection,
              { height: headerHeightAnim },
            ]}
          >
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: headerOpacity,
                  transform: [{ translateY: headerTranslateY }],
                },
              ]}
            >
              <View style={styles.headerLeft}>
                {pickerDetails?.profilePhoto ? (
                  <Image source={{ uri: pickerDetails.profilePhoto }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{userName[0]}</Text>
                  </View>
                )}

                <View>
                  <Text style={styles.greeting}>Hey {userName}</Text>
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={theme.colors.success} />
                    <Text style={styles.location}>{userLocation}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.notify}>
                <Ionicons name="notifications-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        ) : (
          <View
            style={[
              styles.headerCollapseSection,
              { height: headerCollapsed ? 0 : HEADER_ROW_HEIGHT },
            ]}
          >
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: headerOpacity,
                  transform: [{ translateY: headerTranslateY }],
                },
              ]}
            >
              <View style={styles.headerLeft}>
                {pickerDetails?.profilePhoto ? (
                  <Image source={{ uri: pickerDetails.profilePhoto }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{userName[0]}</Text>
                  </View>
                )}

                <View>
                  <Text style={styles.greeting}>Hey {userName}</Text>
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={theme.colors.success} />
                    <Text style={styles.location}>{userLocation}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.notify}>
                <Ionicons name="notifications-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Search bar – safe area padding only when collapsed (Android: animated; iOS: state) */}
        {Platform.OS === 'android' ? (
          <Animated.View style={[styles.searchWrapper, { paddingTop: searchPaddingTopAndroid }]}>
            <View style={[styles.searchBar, styles.searchBarAndroid]}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                placeholder="Search Shipping"
                placeholderTextColor="#888"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
            </View>
          </Animated.View>
        ) : (
          <View style={[styles.searchWrapper, headerCollapsed && { paddingTop: insets.top }]}>
            <View style={[styles.searchBar, styles.searchBarIOS]}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                placeholder="Search Shipping"
                placeholderTextColor="#888"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
            </View>
          </View>
        )}
      </View>

      {/* ================= CONTENT ================= */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
              const y = e.nativeEvent.contentOffset.y;
              if (y >= HEADER_COLLAPSE_THRESHOLD && !headerCollapsed) {
                setHeaderCollapsed(true);
                if (Platform.OS === 'android') {
                  Animated.timing(headerHeightAnim, {
                    toValue: 0,
                    duration: COLLAPSE_DURATION,
                    useNativeDriver: false,
                    easing: Easing.out(Easing.cubic),
                  }).start();
                } else {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
              } else if (y <= HEADER_EXPAND_THRESHOLD && headerCollapsed) {
                setHeaderCollapsed(false);
                if (Platform.OS === 'android') {
                  Animated.timing(headerHeightAnim, {
                    toValue: HEADER_ROW_HEIGHT,
                    duration: COLLAPSE_DURATION,
                    useNativeDriver: false,
                    easing: Easing.out(Easing.cubic),
                  }).start();
                } else {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
              }
            },
          }
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOrders(true, true)}
          />
        }
      >
        {loading && isInitialLoad ? (
          <LoadingScreen message="Loading orders..." />
        ) : error && orders.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.orders}>
            <Text style={styles.sectionTitle}>Available Orders</Text>

            {filteredOrders.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="cube-outline" size={64} color="#CCC" />
                </View>
                <Text style={styles.emptyTitle}>No orders available</Text>
                <Text style={styles.emptySub}>New orders will appear here when available</Text>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={() => loadOrders(true, true)}
                >
                  <Ionicons name="refresh" size={18} color={theme.colors.success} />
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredOrders.map((order) => {
                const isPicking = pickingOrderId === order.id;
                const financialStatus = order.displayFinancialStatus || 'PENDING';
                const isCOD = financialStatus !== 'PAID' && financialStatus !== 'AUTHORIZED';
                const orderType = isCOD ? 'COD' : 'Prepaid';



                return (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => onViewOrderDetails?.(order.id)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.orderNumberRow}>
                        <Ionicons name="cube-outline" size={20} color="#000" style={styles.orderIcon} />
                        <Text style={styles.orderNumber}>{order.name}</Text>
                      </View>
                      <View style={[styles.orderTypeBadge, isCOD ? styles.codBadge : styles.prepaidBadge]}>
                        <Ionicons
                          name={isCOD ? "cash-outline" : "checkmark-circle-outline"}
                          size={14}
                          color={isCOD ? '#E65100' : '#2E7D32'}
                        />
                        <Text style={[styles.orderTypeText, { color: isCOD ? '#E65100' : '#2E7D32' }]}>
                          {orderType}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.addressRow}>
                      <Ionicons name="location-outline" size={16} color="#666" style={styles.addressIcon} />
                      <Text numberOfLines={2} style={styles.address}>
                        {order.shippingAddress?.address1}, {order.shippingAddress?.city}
                      </Text>
                    </View>


                    <TouchableOpacity
                      style={[styles.pickBtn, isPicking && { opacity: 0.6 }]}
                      disabled={isPicking}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePickOrder(order);
                      }}
                    >
                      {isPicking ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" style={styles.pickIcon} />
                          <Text style={styles.pickText}>Pick This Order</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </Animated.ScrollView>

      {/* ================= TOP FADE (MASK) ================= */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(0,0,0,0.9)',
          'rgba(0,0,0,0.6)',
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0)',
        ]}
        locations={[0, 0.35, 0.65, 1]}
        style={styles.topFade}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /* Fade overlay (BELOW header/search) */
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 230,
    zIndex: 20,
  },

  headerContainer: {
    zIndex: 30,
    elevation: 30,
    overflow: 'hidden',
  },

  headerCollapseSection: {
    overflow: 'hidden',
  },

  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 30,
    elevation: 30,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },

  greeting: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  locationRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },

  location: {
    color: '#fff',
    opacity: 0.9,
  },

  notify: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 30,
    elevation: 30,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  searchBarIOS: {
    paddingVertical: 14,
    minHeight: 50,
  },
  searchBarAndroid: {
    paddingVertical: 5,
    minHeight: 46,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  orders: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    color: '#000',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F5F5F5',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderIcon: {
    marginRight: 8,
  },
  orderNumber: {
    fontWeight: '700',
    fontSize: 17,
    color: '#000',
  },
  orderTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  codBadge: {
    backgroundColor: '#FFF3E0',
  },
  prepaidBadge: {
    backgroundColor: '#E8F5E9',
  },
  orderTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  address: {
    color: '#666',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  addressIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  metaDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#DDD',
    marginHorizontal: 8,
  },

  pickBtn: {
    backgroundColor: theme.colors.success,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pickIcon: {
    marginRight: 4,
  },

  pickText: {
    color: '#fff',
    fontWeight: '700',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },

  emptySub: {
    color: '#999',
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  refreshButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#F0F9F0',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  refreshButtonText: {
    color: theme.colors.success,
    fontWeight: '600',
    fontSize: 15,
  },

  error: {
    textAlign: 'center',
    color: 'red',
    marginTop: 40,
  },
});
