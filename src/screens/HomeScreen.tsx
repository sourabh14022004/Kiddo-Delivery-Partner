import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PickerDetails } from './PickerDetailsScreen';
import { fetchOrders, ShopifyOrder } from '../services/shopifyService';
import { syncShopifyOrderToFirestore, assignOrderToRider, isOrderAssigned } from '../services/orderService';
import { startLocationTracking } from '../services/locationService';
import { WAREHOUSE_ADDRESS } from '../config/config';
import { Alert } from 'react-native';
import { theme } from '../config/theme';
import LoadingScreen from '../components/LoadingScreen';

interface HomeScreenProps {
  phoneNumber?: string;
  pickerDetails?: PickerDetails | null;
  onLogout?: () => void;
  onOrderSelect?: (orderId: string) => void;
  onOrderPicked?: (orderId: string) => void;
  onViewOrderDetails?: (orderId: string) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({
  phoneNumber,
  pickerDetails,
  onOrderSelect,
  onOrderPicked,
  onViewOrderDetails,
}) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await fetchOrders(20);
      
      if (response.success && response.data) {
        // Remove fulfilled orders from the list
        const orderNodes = response.data.orders.edges
          .map((edge) => edge.node)
          .filter(
            (order) =>
              order.displayFulfillmentStatus !== 'FULFILLED' &&
              order.displayFulfillmentStatus !== 'DELIVERED'
          );
        
        // Sync orders to Firestore first (non-blocking)
        await Promise.all(
          orderNodes.map((order) =>
            syncShopifyOrderToFirestore(order).catch((err) => {
              console.warn('Failed to sync order to Firestore:', err);
            })
          )
        );
        
        // Check assignment status for each order and filter out assigned ones
        const unassignedOrders: ShopifyOrder[] = [];
        for (const order of orderNodes) {
          const assigned = await isOrderAssigned(order.id);
          if (!assigned) {
            unassignedOrders.push(order);
          }
        }
        
        setOrders(unassignedOrders);
      } else {
        setError(response.error || 'Failed to load orders');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const formatPrice = (amount: string, currencyCode: string) => {
    return `${currencyCode} ${parseFloat(amount).toFixed(2)}`;
  };

  const getOrderNumber = (order: ShopifyOrder | any): string => {
    // Extract order number from name (e.g., "#1047" from "Order #1047")
    if (order.name || order.shopifyOrderName) {
      const name = order.name || order.shopifyOrderName;
      const match = name.match(/#(\d+)/);
      if (match) {
        return `#${match[1]}`;
      }
      return name;
    }
    // Fallback to last part of ID
    const orderId = order.id || order.shopifyOrderId || '';
    const idParts = orderId.split('/');
    const lastPart = idParts[idParts.length - 1];
    if (lastPart.length >= 8) {
      return `#${lastPart.slice(-8, -4)}${lastPart.slice(-4)}`;
    }
    return `#${lastPart}`;
  };

  const getTrackingId = (order: any): string => {
    const orderId = order.shopifyOrderId || order.id || '';
    const idParts = orderId.split('/');
    const lastPart = idParts[idParts.length - 1];
    if (lastPart.length >= 10) {
      return `#${lastPart.slice(-10, -6)}${lastPart.slice(-6, -3)}${lastPart.slice(-3)}`;
    }
    return getOrderNumber(order);
  };

  const getOrderStatus = (order: any): { label: string; color: string } => {
    const status = order.status || 'ASSIGNED';
    if (status === 'DELIVERED') {
      return { label: 'Delivered', color: '#4CAF50' };
    } else if (status === 'IN_TRANSIT') {
      return { label: 'In Transit', color: '#FFD700' };
    } else if (status === 'PICKED_UP') {
      return { label: 'Picked Up', color: '#FFD700' };
    }
    return { label: 'In Transit', color: '#FFD700' };
  };

  const getOrderLocation = (order: any): string => {
    if (order.shopifyData?.shippingAddress) {
      const addr = order.shopifyData.shippingAddress;
      return `${addr.city || ''}${addr.province ? ', ' + addr.province : ''}`.trim() || 'Location';
    }
    return 'Location';
  };

  const getDeliveryDate = (order: any): string => {
    if (order.deliveredAt) {
      const date = order.deliveredAt.toDate ? order.deliveredAt.toDate() : new Date(order.deliveredAt);
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (order.assignedAt) {
      const date = order.assignedAt.toDate ? order.assignedAt.toDate() : new Date(order.assignedAt);
      const deliveryDate = new Date(date);
      deliveryDate.setDate(deliveryDate.getDate() + 2); // Estimate 2 days for delivery
      return deliveryDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getFullAddress = (order: ShopifyOrder): string => {
    if (!order.shippingAddress) return 'Address not available';
    
    const addr = order.shippingAddress;
    const parts = [
      addr.address1,
      addr.address2,
      addr.city,
      addr.province,
      addr.zip,
      addr.country
    ].filter(Boolean);
    
    return parts.join(', ');
  };

  const getPaymentType = (financialStatus: string): string => {
    if (financialStatus === 'PAID' || financialStatus === 'AUTHORIZED') {
      return 'Prepaid';
    }
    return 'COD';
  };

  const getTotalItems = (lineItems: ShopifyOrder['lineItems']): number => {
    return lineItems.edges.reduce((sum, item) => sum + item.node.quantity, 0);
  };

  const handleOrderPress = (order: ShopifyOrder) => {
    if (onOrderSelect) {
      onOrderSelect(order.id);
    }
  };

  const handlePickOrder = async (order: ShopifyOrder) => {
    if (!phoneNumber) {
      Alert.alert('Error', 'Please login to pick orders');
      return;
    }

    const riderId = phoneNumber.replace(/\D/g, ''); // Clean phone number as rider ID
    
    setPickingOrderId(order.id);
    
    try {
      // Step 1: Sync the order to Firestore if not already synced
      await syncShopifyOrderToFirestore(order);
      
      // Step 2: Lock the order in Shopify + Firebase
      const result = await assignOrderToRider(order.id, riderId);
      
      if (result.success) {
        // Step 3: Start location tracking
        const trackingStarted = await startLocationTracking(riderId);
        if (!trackingStarted) {
          console.warn('Location tracking failed to start, but order is assigned');
        }

        // Step 4: Navigate to Orders screen with this order
        if (onOrderSelect) {
          onOrderSelect(order.id);
        }
        
        // Step 5: Navigate to Order Details
        if (onOrderPicked) {
          onOrderPicked(order.id);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to assign order');
        setPickingOrderId(null);
      }
    } catch (error: any) {
      console.error('Error picking order:', error);
      Alert.alert('Error', error.message || 'Failed to pick order');
      setPickingOrderId(null);
    }
  };

  const activeOrdersCount = orders.filter(
    (order) => order.displayFulfillmentStatus === 'UNFULFILLED' || 
                order.displayFulfillmentStatus === 'PARTIALLY_FULFILLED'
  ).length;

  // Filter orders based on search query
  const filteredOrders = orders.filter((order) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const orderName = order.name?.toLowerCase() || '';
    const address = order.shippingAddress?.address1?.toLowerCase() || '';
    const city = order.shippingAddress?.city?.toLowerCase() || '';
    return orderName.includes(query) || address.includes(query) || city.includes(query);
  });

  const userName = pickerDetails?.fullName?.split(' ')[0] || 'Partner';
  const userLocation = pickerDetails?.city || 'Location';

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />
      
      {/* Header with Profile */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {pickerDetails?.profilePhoto ? (
            <Image 
              source={{ uri: pickerDetails.profilePhoto }} 
              style={styles.profileImageSmall} 
            />
          ) : (
            <View style={styles.profileImagePlaceholderSmall}>
              <Text style={styles.profileImageTextSmall}>
                {userName[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerUserInfo}>
            <Text style={styles.headerGreeting}>Hey {userName}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={theme.colors.success} />
              <Text style={styles.headerLocation}>{userLocation}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Search Bar - Fixed */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Shipping"
            placeholderTextColor={theme.colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => loadOrders(true)}
            tintColor={theme.colors.success}
            colors={[theme.colors.success]}
            progressBackgroundColor={theme.colors.primaryDark}
          />
        }
      >
        {/* Available Orders Section */}
        {loading ? (
          <LoadingScreen message="Loading orders..." />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadOrders()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersSectionTitle}>Available Orders</Text>
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No orders found' : 'No orders available'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? 'Try a different search term' : 'Check back later for new orders'}
                </Text>
              </View>
            ) : (
              filteredOrders.map((order) => {
                const fullAddress = getFullAddress(order);
                const paymentType = getPaymentType(order.displayFinancialStatus);
                const totalItems = getTotalItems(order.lineItems);
                const orderTotal = order.totalPriceSet?.shopMoney;
                const orderNumber = getOrderNumber(order);
                const isPicking = pickingOrderId === order.id;

                return (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.orderCard}
                    onPress={() => handleOrderPress(order)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.orderCardContent}>
                      <View style={styles.orderHeader}>
                        <Text style={styles.orderNumber}>{orderNumber}</Text>
                        {orderTotal && (
                          <Text style={styles.orderPrice}>
                            {formatPrice(orderTotal.amount, orderTotal.currencyCode)}
                          </Text>
                        )}
                      </View>
                      
                      <Text style={styles.orderDescription} numberOfLines={3}>
                        {fullAddress}
                      </Text>

                      <View style={styles.badgesRow}>
                        <View style={styles.badgeItem}>
                          <Text style={styles.badgeText}>{totalItems} Item{totalItems !== 1 ? 's' : ''}</Text>
                        </View>
                        <View style={styles.badgePrepaid}>
                          <Text style={styles.badgeText}>{paymentType}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.pickButton, isPicking && styles.pickButtonDisabled]}
                        onPress={(e) => {
                          e.stopPropagation();
                          handlePickOrder(order);
                        }}
                        disabled={isPicking}
                        activeOpacity={0.8}
                      >
                        {isPicking ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.pickButtonText}>Pick This Order</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDark,
  },
  header: {
    backgroundColor: '#000',
    paddingTop: 50,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.success,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImageSmall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileImagePlaceholderSmall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileImageTextSmall: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerUserInfo: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationIcon: {
    color: theme.colors.success,
  },
  headerLocation: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundDark,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.success,
    ...theme.shadows.small,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.textLight,
    paddingVertical: 0,
  },
  currentTrackingSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  currentTrackingCard: {
    backgroundColor: '#FFD700',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 280,
  },
  trackingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  trackingCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  fastBadge: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fastBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  trackingId: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: theme.spacing.md,
  },
  trackingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: 8,
  },
  trackingLocation: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000',
  },
  trackingStatus: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  progressBarContainer: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  progressBarFill: {
    height: '100%',
    width: '60%',
    backgroundColor: '#FFD700',
    borderRadius: 3,
  },
  progressBarIcon: {
    position: 'absolute',
    left: '55%',
    top: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxIllustration: {
    position: 'absolute',
    right: theme.spacing.lg,
    bottom: theme.spacing.md,
  },
  boxStack: {
    alignItems: 'center',
  },
  box: {
    backgroundColor: '#8B4513',
    borderWidth: 2,
    borderColor: '#000',
  },
  boxSmall: {
    width: 40,
    height: 30,
    marginBottom: -5,
    zIndex: 2,
  },
  boxLarge: {
    width: 50,
    height: 40,
  },
  recentShippingSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  recentShippingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: theme.spacing.md,
  },
  recentOrderCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  recentOrderStatusBadge: {
    backgroundColor: '#FFD700',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: theme.spacing.sm,
  },
  recentOrderStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  recentOrderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: theme.spacing.xs,
  },
  recentOrderLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  recentOrderDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: theme.spacing.sm,
  },
  miniProgressBarContainer: {
    marginTop: theme.spacing.sm,
  },
  miniProgressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  miniProgressBarFill: {
    height: '100%',
    width: '50%',
    backgroundColor: '#FFD700',
    borderRadius: 2,
  },
  miniProgressBarIcon: {
    position: 'absolute',
    left: '45%',
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
  },
  errorText: {
    ...theme.typography.bodySmall,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    ...theme.typography.button,
    color: theme.colors.textLight,
  },
  emptyContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
    opacity: 0.7,
    textAlign: 'center',
  },
  ordersSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  ordersSectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.success,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
    ...theme.shadows.medium,
    overflow: 'hidden',
  },
  orderCardContent: {
    padding: theme.spacing.lg,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  orderNumber: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: '700',
  },
  orderPrice: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: '700',
  },
  orderDescription: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
    opacity: 0.8,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  badgeItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.badgeGreen,
  },
  badgePrepaid: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.badgeBlue,
  },
  badgeText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    fontWeight: '700',
  },
  locationContainer: {
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  locationIcon: {
    marginRight: theme.spacing.sm,
    marginTop: 2,
  },
  locationText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    flex: 1,
    lineHeight: 18,
  },
  pickButton: {
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  pickButtonDisabled: {
    opacity: 0.6,
  },
  pickButtonText: {
    ...theme.typography.button,
    color: theme.colors.textLight,
  },
});

export default HomeScreen;
