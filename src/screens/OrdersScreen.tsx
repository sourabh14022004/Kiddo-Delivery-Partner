import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Animated,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fetchOrders, ShopifyOrder } from "../services/shopifyService";
import {
  syncShopifyOrderToFirestore,
  getOrderDetails,
  getRiderActiveOrder,
  getRiderOrders,
} from "../services/orderService";
import { WAREHOUSE_ADDRESS } from "../config/config";
import { theme } from "../config/theme";
import LoadingScreen from "../components/LoadingScreen";

interface OrdersScreenProps {
  phoneNumber?: string;
  onOrderPicked?: (orderId: string) => void;
  selectedOrderId?: string | null;
  onViewOrderDetails?: (orderId: string) => void;
}

const OrdersScreen: React.FC<OrdersScreenProps> = ({
  phoneNumber,
  onOrderPicked,
  selectedOrderId,
  onViewOrderDetails,
}) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [allOrders, setAllOrders] = useState<ShopifyOrder[]>([]); // All orders before date filtering
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const scrollViewRef = useRef<ScrollView>(null);
  const orderRefs = useRef<{ [key: string]: View | null }>({});

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_progress" | "delivered" | "returned"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Animated values for smooth, fast header transition
  const headerOpacity = useRef(new Animated.Value(1)).current;
  const headerHeight = useRef(new Animated.Value(60)).current;
  const filterContainerPadding = useRef(new Animated.Value(10)).current; // Animate filter container top padding (0 when hidden)
  const searchContainerMargin = useRef(new Animated.Value(16)).current; // Animate search container top margin
  const isHeaderVisible = useRef(true); // Track current header state to avoid unnecessary animations

  // Filter orders by status and search query
  const filterOrders = useCallback(
    (ordersList: ShopifyOrder[]): ShopifyOrder[] => {
      // First filter out canceled orders
      let filtered = ordersList.filter(order => !order.cancelledAt);

      // Filter by status
      if (statusFilter !== "all") {
        filtered = filtered.filter((order: any) => {
          const orderStatus = order.status || "ASSIGNED";
          if (statusFilter === "in_progress") {
            return (
              orderStatus === "ASSIGNED" ||
              orderStatus === "PICKED" ||
              orderStatus === "IN_TRANSIT"
            );
          } else if (statusFilter === "delivered") {
            return orderStatus === "DELIVERED";
          } else if (statusFilter === "returned") {
            return orderStatus === "RETURNED";
          }
          return true;
        });
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter((order: any) => {
          const trackingId = order.name || order.id.split("/").pop() || "";
          const orderDate = order.assignedAt
            ? order.assignedAt.toDate
              ? order.assignedAt.toDate()
              : new Date(order.assignedAt)
            : new Date(order.createdAt);
          const dateStr = orderDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return (
            trackingId.toLowerCase().includes(query) ||
            dateStr.toLowerCase().includes(query)
          );
        });
      }

      return filtered;
    },
    [statusFilter, searchQuery]
  );

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

      const riderId = phoneNumber.replace(/\D/g, "");

      // Get all orders assigned to this rider from Firestore
      const riderOrdersResult = await getRiderOrders(riderId);

      if (!riderOrdersResult.success || !riderOrdersResult.orders) {
        setError(riderOrdersResult.error || "Failed to load orders");
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
            name: orderData.shopifyOrderName || "",
            createdAt:
              orderData.createdAt?.toDate?.()?.toISOString() ||
              new Date().toISOString(),
            updatedAt:
              orderData.updatedAt?.toDate?.()?.toISOString() ||
              new Date().toISOString(),
            cancelledAt: orderData.cancelledAt || null,
            displayFulfillmentStatus:
              shopifyData.displayFulfillmentStatus || "UNFULFILLED",
            displayFinancialStatus:
              shopifyData.displayFinancialStatus || "PENDING",
            totalPriceSet: shopifyData.totalPrice || {
              shopMoney: { amount: "0", currencyCode: "INR" },
            },
            shippingAddress: shopifyData.shippingAddress,
            lineItems: shopifyData.lineItems || { edges: [] },
          };
          // Attach assignedAt for date filtering
          (order as any).assignedAt = orderData.assignedAt;
          // Attach order status from Firestore
          (order as any).status = orderData.status || "ASSIGNED";
          // Attach deliveredAt timestamp if available
          (order as any).deliveredAt = orderData.deliveredAt;
          // Attach returnedAt timestamp if available
          (order as any).returnedAt = orderData.returnedAt;
          // Attach updatedAt for returned orders fallback
          (order as any).updatedAt = orderData.updatedAt;
          convertedOrders.push(order);
        }
      }

      setAllOrders(convertedOrders);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      console.error("Error loading orders:", err);
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
      const aStatus = (a as any).status || "ASSIGNED";
      const bStatus = (b as any).status || "ASSIGNED";
      const aCompleted = aStatus === "DELIVERED" || aStatus === "RETURNED";
      const bCompleted = bStatus === "DELIVERED" || bStatus === "RETURNED";

      // If one is completed and the other isn't, completed goes to bottom
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;

      // If both are completed or both are not, sort by assignedAt (most recent first)
      const aTime =
        (a as any).assignedAt?.toMillis?.() ||
        (a as any).assignedAt?.getTime?.() ||
        0;
      const bTime =
        (b as any).assignedAt?.toMillis?.() ||
        (b as any).assignedAt?.getTime?.() ||
        0;
      return bTime - aTime;
    });

    setOrders(filteredOrders);
    // Reset header visibility when orders change
    if (!isHeaderVisible.current) {
      isHeaderVisible.current = true;
      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(headerHeight, {
          toValue: 60,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(filterContainerPadding, {
          toValue: 16,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(searchContainerMargin, {
          toValue: 16,
          duration: 150,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [allOrders, filterOrders]);

  // Scroll to selected order when selectedOrderId changes
  useEffect(() => {
    if (selectedOrderId && orders.length > 0) {
      // Find the index of the selected order
      const orderIndex = orders.findIndex(
        (order) => order.id === selectedOrderId
      );
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

  // Handle scroll - smooth and fast header hide/show when there are enough orders to scroll
  const hasEnoughOrders = orders.length > 3; // Threshold for enabling scroll behavior
  const handleScroll = (event: any) => {
    if (!hasEnoughOrders) return;

    const offsetY = event.nativeEvent.contentOffset.y;
    const shouldShow = offsetY <= 20;

    // Only animate if state is changing
    if (shouldShow !== isHeaderVisible.current) {
      isHeaderVisible.current = shouldShow;

      // Smooth and fast animation (150ms)
      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: shouldShow ? 1 : 0,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(headerHeight, {
          toValue: shouldShow ? 60 : 0,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(filterContainerPadding, {
          toValue: shouldShow ? 16 : 0, // Remove all padding when header is hidden - place right below SafeAreaView
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(searchContainerMargin, {
          toValue: shouldShow ? 16 : 8, // Reduce margin when header is hidden
          duration: 150,
          useNativeDriver: false,
        }),
      ]).start();
    }
  };

  const getTrackingId = (order: ShopifyOrder): string => {
    // Extract tracking ID from order name or ID
    if (order.name) {
      return order.name;
    }
    const idParts = order.id.split("/");
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
    return "Product";
  };

  const getEstimatedDelivery = (order: any): string => {
    if (!order.assignedAt) return "";

    const assignedDate = order.assignedAt.toDate
      ? order.assignedAt.toDate()
      : new Date(order.assignedAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const assignedDay = new Date(assignedDate);
    assignedDay.setHours(0, 0, 0, 0);

    const diffTime = assignedDay.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 1) return `${diffDays} days`;
    return "";
  };

  const getOrderStatus = (
    order: any
  ): {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
    gradient: string[];
  } => {
    const status = order.status || "ASSIGNED";

    if (status === "DELIVERED") {
      return {
        label: "Complete",
        color: "#4CAF50",
        bgColor: "#1B5E20",
        icon: "checkmark-circle",
        gradient: ["#1B5E20", "#2E7D32"],
      };
    } else if (status === "RETURNED") {
      return {
        label: "Returned",
        color: "#8B4513",
        bgColor: "#5D4037",
        icon: "arrow-back-circle",
        gradient: ["#5D4037", "#6D4C41"],
      };
    } else {
      return {
        label: "In Progress",
        color: "#9C27B0",
        bgColor: "#4A148C",
        icon: "time",
        gradient: ["#4A148C", "#6A1B9A"],
      };
    }
  };

  const getCompletionDate = (order: any): string => {
    const status = order.status || "ASSIGNED";

    // For delivered orders, use deliveredAt
    if (status === "DELIVERED" && order.deliveredAt) {
      const deliveredDate = order.deliveredAt.toDate
        ? order.deliveredAt.toDate()
        : new Date(order.deliveredAt);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const deliveredDay = new Date(deliveredDate);
      deliveredDay.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - deliveredDay.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Format time
      const timeStr = deliveredDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // Format date based on how recent it is
      if (diffDays === 0) {
        return `Today at ${timeStr}`;
      } else if (diffDays === 1) {
        return `Yesterday at ${timeStr}`;
      } else if (diffDays < 7) {
        return `${diffDays} days ago at ${timeStr}`;
      } else {
        // Show full date for older orders
        const dateStr = deliveredDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year:
            deliveredDate.getFullYear() !== today.getFullYear()
              ? "numeric"
              : undefined,
        });
        return `${dateStr} at ${timeStr}`;
      }
    }

    // For returned orders, use returnedAt if available, otherwise fallback to updatedAt
    if (status === "RETURNED" && (order.returnedAt || order.updatedAt)) {
      const returnedDate = order.returnedAt
        ? order.returnedAt.toDate
          ? order.returnedAt.toDate()
          : new Date(order.returnedAt)
        : order.updatedAt.toDate
          ? order.updatedAt.toDate()
          : new Date(order.updatedAt);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const returnedDay = new Date(returnedDate);
      returnedDay.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - returnedDay.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const timeStr = returnedDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      if (diffDays === 0) {
        return `Today at ${timeStr}`;
      } else if (diffDays === 1) {
        return `Yesterday at ${timeStr}`;
      } else if (diffDays < 7) {
        return `${diffDays} days ago at ${timeStr}`;
      } else {
        const dateStr = returnedDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year:
            returnedDate.getFullYear() !== today.getFullYear()
              ? "numeric"
              : undefined,
        });
        return `${dateStr} at ${timeStr}`;
      }
    }

    return "";
  };



  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>My Deliveries</Text>
        </View>
        <LoadingScreen message="Loading orders..." fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="light" />

      {/* Sticky Header Container */}
      <View style={styles.stickyHeaderContainer}>
        {/* Header - smooth and fast hide/show on scroll */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerOpacity,
              height: headerHeight,
              overflow: "hidden",
            },
          ]}
        >
          <Text style={styles.title}>My Deliveries</Text>
        </Animated.View>

        {/* Status Filter Tabs - Always visible, moves up when header is hidden */}
        <Animated.View
          style={[
            styles.filterContainer,
            {
              paddingTop: filterContainerPadding,

            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === "all" && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter("all")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterButtonText,
                statusFilter === "all" && styles.filterButtonTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === "in_progress" && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter("in_progress")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterButtonText,
                statusFilter === "in_progress" && styles.filterButtonTextActive,
              ]}
            >
              In Progress
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === "delivered" && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter("delivered")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterButtonText,
                statusFilter === "delivered" && styles.filterButtonTextActive,
              ]}
            >
              Delivered
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              statusFilter === "returned" && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter("returned")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterButtonText,
                statusFilter === "returned" && styles.filterButtonTextActive,
              ]}
            >
              Returned
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Search Bar - Always visible, moves up when header is hidden */}
        <Animated.View
          style={[
            styles.searchContainer,
            {
              marginTop: searchContainerMargin,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color="#999"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by track ID or date"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </Animated.View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        onScroll={hasEnoughOrders ? handleScroll : undefined}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOrders(true)}
          />
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
                ? "Try adjusting your search or filter criteria."
                : "You don't have any orders matching the selected filter."}
            </Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => {
              const trackingId = getTrackingId(order);
              const productName = getProductName(order);
              const estimatedDelivery = getEstimatedDelivery(order);
              const statusInfo = getOrderStatus(order);
              const completionDate = getCompletionDate(order);
              const isSelected = selectedOrderId === order.id;
              const isCompleted =
                (order as any).status === "DELIVERED" ||
                (order as any).status === "RETURNED";
              const gradientColors: [string, string] = [
                statusInfo.gradient[0],
                statusInfo.gradient[1],
              ];

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
                  ]}
                  onPress={() =>
                    onViewOrderDetails && onViewOrderDetails(order.id)
                  }
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.orderCardGradient}
                  >
                    <View style={styles.orderCardContent}>
                      <View style={styles.orderInfoRow}>
                        <View style={styles.orderInfoLeft}>
                          <View style={styles.productNameRow}>
                            <Ionicons
                              name="cube-outline"
                              size={18}
                              color="#FFFFFF"
                              style={styles.productIcon}
                            />
                            <Text style={styles.productName} numberOfLines={1}>
                              {productName}
                            </Text>
                          </View>
                          <View style={styles.trackingRow}>
                            <Ionicons
                              name="barcode-outline"
                              size={14}
                              color="#CCCCCC"
                              style={styles.trackingIcon}
                            />
                            <Text style={styles.trackingId} numberOfLines={1}>
                              {trackingId}
                            </Text>
                          </View>
                          {isCompleted && completionDate ? (
                            <View style={styles.dateRow}>
                              <Ionicons
                                name="time-outline"
                                size={14}
                                color="#CCCCCC"
                                style={styles.dateIcon}
                              />
                              <Text style={styles.completionDate}>
                                {completionDate}
                              </Text>
                            </View>
                          ) : estimatedDelivery ? (
                            <View style={styles.dateRow}>
                              <Ionicons
                                name="calendar-outline"
                                size={14}
                                color="#FFD700"
                                style={styles.dateIcon}
                              />
                              <Text style={styles.estimatedDelivery}>
                                {estimatedDelivery}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.orderInfoRight}>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: statusInfo.color },
                            ]}
                          >
                            <Ionicons
                              name={statusInfo.icon as any}
                              size={14}
                              color="#FFFFFF"
                              style={styles.statusIcon}
                            />
                            <Text style={styles.statusBadgeText}>
                              {statusInfo.label}
                            </Text>
                          </View>
                          <View style={styles.chevronContainer}>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color="#FFFFFF"
                            />
                          </View>
                        </View>
                      </View>


                    </View>
                  </LinearGradient>
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
    backgroundColor: "#000000",
  },
  stickyHeaderContainer: {
    backgroundColor: "#000000",
    zIndex: 100,
    elevation: 100,
    paddingTop: 0, // Will be animated
  },
  header: {
    backgroundColor: "#000000",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...theme.typography.h2,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: "#000000",
  },
  filterButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  filterButtonActive: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
    ...theme.shadows.small,
  },
  filterButtonText: {
    ...theme.typography.buttonSmall,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: theme.colors.textLight,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: "#FFFFFF",
    paddingVertical: theme.spacing.xs,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xxl,
    marginTop: 100,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    ...theme.typography.h3,
    color: "#FFFFFF",
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    ...theme.typography.bodySmall,
    color: "#999999",
    textAlign: "center",
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
    color: "#000000",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xxl,
    marginTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.typography.h3,
    color: "#FFFFFF",
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    ...theme.typography.bodySmall,
    color: "#999999",
    textAlign: "center",
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
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  ordersList: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  orderCard: {
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    overflow: "hidden",
    ...theme.shadows.medium,
  },
  orderCardSelected: {
    borderWidth: 2.5,
    borderColor: "#FFD700",
    ...theme.shadows.large,
  },
  orderCardGradient: {
    borderRadius: theme.borderRadius.lg,
  },
  orderCardContent: {
    padding: theme.spacing.md + 4,
  },
  orderInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderInfoLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  orderInfoRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  productNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xs + 2,
  },
  productIcon: {
    marginRight: theme.spacing.xs + 2,
  },
  productName: {
    ...theme.typography.body,
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
  },
  trackingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xs + 1,
  },
  trackingIcon: {
    marginRight: theme.spacing.xs + 1,
  },
  trackingId: {
    ...theme.typography.caption,
    fontSize: 13,
    color: "#E0E0E0",
    fontWeight: "500",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.xs / 2,
  },
  dateIcon: {
    marginRight: theme.spacing.xs + 1,
  },
  estimatedDelivery: {
    ...theme.typography.caption,
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "600",
  },
  completionDate: {
    ...theme.typography.caption,
    fontSize: 13,
    color: "#E0E0E0",
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md - 2,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.pill,
    gap: theme.spacing.xs,
  },
  statusIcon: {
    marginRight: -2,
  },
  statusBadgeText: {
    ...theme.typography.caption,
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  chevronContainer: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
});

export default OrdersScreen;
