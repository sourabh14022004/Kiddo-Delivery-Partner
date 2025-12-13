import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchOrders, ShopifyOrder } from '../services/shopifyService';
import { syncShopifyOrderToFirestore, getOrderDetails, getRiderActiveOrder, getRiderOrders } from '../services/orderService';
import { WAREHOUSE_ADDRESS } from '../config/config';
import { theme } from '../config/theme';
import LoadingScreen from '../components/LoadingScreen';

interface OrdersScreenProps {
  phoneNumber?: string;
  onOrderPicked?: (orderId: string) => void;
  selectedOrderId?: string | null;
  onViewOrderDetails?: (orderId: string) => void;
}

const OrdersScreen: React.FC<OrdersScreenProps> = ({ phoneNumber, onOrderPicked, selectedOrderId, onViewOrderDetails }) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [allOrders, setAllOrders] = useState<ShopifyOrder[]>([]); // All orders before date filtering
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);
  const orderRefs = useRef<{ [key: string]: View | null }>({});
  
  // Status filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'delivered' | 'returned'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter orders by status and search query
  const filterOrders = useCallback((ordersList: ShopifyOrder[]): ShopifyOrder[] => {
    let filtered = ordersList;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((order: any) => {
        const orderStatus = order.status || 'ASSIGNED';
        if (statusFilter === 'in_progress') {
          return orderStatus === 'ASSIGNED' || orderStatus === 'PICKED' || orderStatus === 'IN_TRANSIT';
        } else if (statusFilter === 'delivered') {
          return orderStatus === 'DELIVERED';
        } else if (statusFilter === 'returned') {
          return orderStatus === 'RETURNED';
        }
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((order: any) => {
        const trackingId = order.name || order.id.split('/').pop() || '';
        const orderDate = order.assignedAt 
          ? (order.assignedAt.toDate ? order.assignedAt.toDate() : new Date(order.assignedAt))
          : new Date(order.createdAt);
        const dateStr = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        return trackingId.toLowerCase().includes(query) || dateStr.toLowerCase().includes(query);
      });
    }

    return filtered;
  }, [statusFilter, searchQuery]);

  const loadOrders = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      if (!phoneNumber) {
        setOrders([]);
        setAllOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const riderId = phoneNumber.replace(/\D/g, '');
      
      // Get all orders assigned to this rider from Firestore
      const riderOrdersResult = await getRiderOrders(riderId);
      
      if (!riderOrdersResult.success || !riderOrdersResult.orders) {
        setError(riderOrdersResult.error || 'Failed to load orders');
        setOrders([]);
        setAllOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Convert Firestore orders to ShopifyOrder format
      const convertedOrders: ShopifyOrder[] = [];
      
      for (const orderData of riderOrdersResult.orders) {
        const shopifyData = orderData.shopifyData;
        if (shopifyData) {
          const order: ShopifyOrder = {
            id: orderData.shopifyOrderId || orderData.id,
            name: orderData.shopifyOrderName || '',
            createdAt: orderData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: orderData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            displayFulfillmentStatus: shopifyData.displayFulfillmentStatus || 'UNFULFILLED',
            displayFinancialStatus: shopifyData.displayFinancialStatus || 'PENDING',
            totalPriceSet: shopifyData.totalPrice || { shopMoney: { amount: '0', currencyCode: 'INR' } },
            shippingAddress: shopifyData.shippingAddress,
            lineItems: shopifyData.lineItems || { edges: [] },
          };
          // Attach assignedAt for date filtering
          (order as any).assignedAt = orderData.assignedAt;
          // Attach order status from Firestore
          (order as any).status = orderData.status || 'ASSIGNED';
          // Attach deliveredAt timestamp if available
          (order as any).deliveredAt = orderData.deliveredAt;
          convertedOrders.push(order);
        }
      }

      setAllOrders(convertedOrders);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error('Error loading orders:', err);
      setOrders([]);
      setAllOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [phoneNumber]);

  // Filter and sort orders when filters or search change
  useEffect(() => {
    if (allOrders.length === 0) {
      setOrders([]);
      return;
    }

    // Filter by status and search
    let filteredOrders = filterOrders(allOrders);
    
    // Sort orders: active orders first, delivered/returned orders at the bottom
    filteredOrders.sort((a, b) => {
      const aStatus = (a as any).status || 'ASSIGNED';
      const bStatus = (b as any).status || 'ASSIGNED';
      const aCompleted = aStatus === 'DELIVERED' || aStatus === 'RETURNED';
      const bCompleted = bStatus === 'DELIVERED' || bStatus === 'RETURNED';
      
      // If one is completed and the other isn't, completed goes to bottom
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;
      
      // If both are completed or both are not, sort by assignedAt (most recent first)
      const aTime = (a as any).assignedAt?.toMillis?.() || (a as any).assignedAt?.getTime?.() || 0;
      const bTime = (b as any).assignedAt?.toMillis?.() || (b as any).assignedAt?.getTime?.() || 0;
      return bTime - aTime;
    });
    
    setOrders(filteredOrders);
  }, [allOrders, filterOrders]);

  // Scroll to selected order when selectedOrderId changes
  useEffect(() => {
    if (selectedOrderId && orders.length > 0) {
      // Find the index of the selected order
      const orderIndex = orders.findIndex(order => order.id === selectedOrderId);
      if (orderIndex >= 0) {
        // Wait a bit for the layout to complete, then scroll
        setTimeout(() => {
          // Estimate scroll position (each card is roughly 200px + margins)
          const estimatedY = orderIndex * 220;
          scrollViewRef.current?.scrollTo({ y: estimatedY, animated: true });
        }, 500);
      }
    }
  }, [selectedOrderId, orders]);

  const getTrackingId = (order: ShopifyOrder): string => {
    // Extract tracking ID from order name or ID
    if (order.name) {
      return order.name;
    }
    const idParts = order.id.split('/');
    const lastPart = idParts[idParts.length - 1];
    // Format as DCV-XXXX-XXX or similar
    if (lastPart.length >= 8) {
      return `DCV-${lastPart.slice(-8, -4)}-${lastPart.slice(-4)}`;
    }
    return lastPart;
  };

  const getProductName = (order: ShopifyOrder): string => {
    // Get first product name from line items
    if (order.lineItems?.edges?.length > 0) {
      return order.lineItems.edges[0].node.title;
    }
    return 'Product';
  };

  const getEstimatedDelivery = (order: any): string => {
    if (!order.assignedAt) return '';
    
    const assignedDate = order.assignedAt.toDate ? order.assignedAt.toDate() : new Date(order.assignedAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const assignedDay = new Date(assignedDate);
    assignedDay.setHours(0, 0, 0, 0);
    
    const diffTime = assignedDay.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `${diffDays} days`;
    return '';
  };

  const getOrderStatus = (order: any): { label: string; color: string; bgColor: string } => {
    const status = order.status || 'ASSIGNED';
    
    if (status === 'DELIVERED') {
      return { label: 'Complete', color: '#4CAF50', bgColor: '#1B5E20' };
    } else if (status === 'RETURNED') {
      return { label: 'Returned', color: '#8B4513', bgColor: '#5D4037' };
    } else {
      return { label: 'In Progress', color: '#9C27B0', bgColor: '#4A148C' };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>My Deliveries</Text>
        </View>
        <LoadingScreen message="Loading orders..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>My Deliveries</Text>
      </View>
      
      {/* Status Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, statusFilter === 'all' && styles.filterButtonActive]}
          onPress={() => setStatusFilter('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, statusFilter === 'all' && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, statusFilter === 'in_progress' && styles.filterButtonActive]}
          onPress={() => setStatusFilter('in_progress')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, statusFilter === 'in_progress' && styles.filterButtonTextActive]}>
            In Progress
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, statusFilter === 'delivered' && styles.filterButtonActive]}
          onPress={() => setStatusFilter('delivered')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, statusFilter === 'delivered' && styles.filterButtonTextActive]}>
            Delivered
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, statusFilter === 'returned' && styles.filterButtonActive]}
          onPress={() => setStatusFilter('returned')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, statusFilter === 'returned' && styles.filterButtonTextActive]}>
            Returned
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by track ID or date"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadOrders(true)} />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Error Loading Orders</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadOrders()}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No orders found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery.trim() 
                ? 'Try adjusting your search or filter criteria.'
                : 'You don\'t have any orders matching the selected filter.'}
            </Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => {
              const trackingId = getTrackingId(order);
              const productName = getProductName(order);
              const estimatedDelivery = getEstimatedDelivery(order);
              const statusInfo = getOrderStatus(order);
              const isSelected = selectedOrderId === order.id;
              
              return (
                <TouchableOpacity
                  key={order.id}
                  ref={(ref) => {
                    if (ref) {
                      orderRefs.current[order.id] = ref;
                    }
                  }}
                  style={[
                    styles.orderCard,
                    isSelected && styles.orderCardSelected,
                    { backgroundColor: statusInfo.bgColor }
                  ]}
                  onPress={() => onViewOrderDetails && onViewOrderDetails(order.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.orderCardContent}>
                    <View style={styles.orderInfoRow}>
                      <View style={styles.orderInfoLeft}>
                        <Text style={styles.productName} numberOfLines={1}>
                          {productName}
                        </Text>
                        <Text style={styles.trackingId} numberOfLines={1}>
                          {trackingId}
                        </Text>
                        {estimatedDelivery && (
                          <Text style={styles.estimatedDelivery}>
                            {estimatedDelivery}
                          </Text>
                        )}
                      </View>
                      <View style={styles.orderInfoRight}>
                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                          <Text style={styles.statusBadgeText}>
                            {statusInfo.label}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#FFF" style={styles.chevronIcon} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    backgroundColor: '#000000',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...theme.typography.h2,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  filterButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: '#2A2A2A',
  },
  filterButtonActive: {
    backgroundColor: theme.colors.success,
  },
  filterButtonText: {
    ...theme.typography.buttonSmall,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: theme.colors.textLight,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: '#FFFFFF',
    paddingVertical: theme.spacing.xs,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    marginTop: 100,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    ...theme.typography.h3,
    color: '#FFFFFF',
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    ...theme.typography.bodySmall,
    color: '#999999',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  retryButton: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    ...theme.typography.button,
    color: '#000000',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    marginTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.typography.h3,
    color: '#FFFFFF',
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    ...theme.typography.bodySmall,
    color: '#999999',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  refreshButton: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ordersList: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  orderCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  orderCardSelected: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  orderCardContent: {
    padding: theme.spacing.md,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderInfoLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  orderInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  productName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: theme.spacing.xs,
  },
  trackingId: {
    ...theme.typography.caption,
    color: '#CCCCCC',
    marginBottom: theme.spacing.xs,
  },
  estimatedDelivery: {
    ...theme.typography.caption,
    color: '#FFD700',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
  },
  statusBadgeText: {
    ...theme.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chevronIcon: {
    marginLeft: theme.spacing.xs,
  },
});

export default OrdersScreen;

