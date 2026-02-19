import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  getOrderDetails,
  assignOrderToRider,
  syncShopifyOrderToFirestore,
} from "../services/orderService";
import { getShopifyOrderById, ShopifyOrder } from "../services/shopifyService";
import { startLocationTracking } from "../services/locationService";
import LoadingScreen from "../components/LoadingScreen";
import { theme } from "../config/theme";
import { useAppContext } from "../context/AppContext";
import { RootStackParamList } from "../navigation/RootNavigator";

type OrderPreviewScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "OrderPreview"
>;

// Update RouteParams to include optional initialOrderData
type OrderPreviewScreenRouteProp = RouteProp<
  {
    OrderPreview: {
      orderId: string;
      initialOrderData?: ShopifyOrder; // Optimistic data passed from previous screen
    };
  },
  "OrderPreview"
>;

const OrderPreviewScreen: React.FC = () => {
  const { phoneNumber } = useAppContext();
  const navigation = useNavigation<OrderPreviewScreenNavigationProp>();
  const route = useRoute<OrderPreviewScreenRouteProp>();
  const { orderId, initialOrderData } = route.params;

  const insets = useSafeAreaInsets();

  // Initialize with passed data if available
  const [order, setOrder] = useState<any>(initialOrderData || null);
  const [loading, setLoading] = useState(!initialOrderData);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "item_details" | "courier" | "receiver" | "order_history"
  >("item_details");

  const loadOrder = useCallback(async () => {
    try {
      if (!order) setLoading(true);
      setError(null);

      let result = await getOrderDetails(orderId);
      let orderData = result.data;

      if (!result.success || !result.data) {
        const shopifyResult = await getShopifyOrderById(orderId);
        if (shopifyResult.success && shopifyResult.data) {
          // If we have fresh data, update it
          await syncShopifyOrderToFirestore(shopifyResult.data);
          result = await getOrderDetails(orderId);
          if (result.success && result.data) orderData = result.data;
        } else {
          // If both fail and we don't have initial data, show error
          if (!order) setError(shopifyResult.error || "Order not found");
          return;
        }
      }

      if (orderData) {
        setOrder(orderData);
      } else if (!order) {
        setError("Failed to load order");
      }
    } catch (err: any) {
      if (!order) setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [orderId, order]);

  useFocusEffect(
    useCallback(() => {
      loadOrder();
    }, [loadOrder]),
  );

  const formatDate = useCallback((dateString: string | any) => {
    if (!dateString) return "N/A";
    const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  const formatDateShort = useCallback((dateString: string | any) => {
    if (!dateString) return "N/A";
    const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const formatPrice = useCallback((amount: string, currencyCode: string) => {
    const code = currencyCode === "USD" ? "$" : currencyCode + " ";
    return `${code}${parseFloat(amount || "0").toFixed(2)}`;
  }, []);

  const getStatusDisplay = useCallback(() => {
    const status =
      order?.status || (order?.shopifyData as any)?.displayFulfillmentStatus;
    if (!status) return "Pending";
    switch (String(status).toUpperCase()) {
      case "ASSIGNED":
        return "Assigned";
      case "PICKED_UP":
        return "Picked up";
      case "IN_TRANSIT":
        return "In progress";
      case "DELIVERED":
        return "Delivered";
      case "RETURNED":
        return "Returned";
      case "FULFILLED":
        return "Fulfilled";
      default:
        return "Assigned";
    }
  }, [order]);

  const handleCall = useCallback(() => {
    const shopifyData = order?.shopifyData || order || {}; // Fallback to order root if shopifyData missing (e.g. strict ShopifyOrder type)
    const phone = shopifyData.shippingAddress?.phone;
    if (phone) Linking.openURL(`tel:${phone.replace(/\D/g, "")}`);
  }, [order]);

  const handleOpenMaps = useCallback(() => {
    const shopifyData = order?.shopifyData || order || {};
    const addr = shopifyData.shippingAddress;
    if (!addr?.address1) return;
    const parts = [
      addr.address1,
      addr.address2,
      addr.city,
      addr.province,
      addr.zip,
      addr.country,
    ].filter(Boolean);
    const url = `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
    Linking.openURL(url);
  }, [order]);

  const handlePickOrder = useCallback(async () => {
    if (!phoneNumber) {
      Alert.alert("Login required", "Please log in to pick orders.");
      return;
    }

    // Support both Firestore structure (order.shopifyData) and direct ShopifyOrder (order)
    const shopifyData = order?.shopifyData || order;
    if (!shopifyData) return;

    setPicking(true);
    try {
      const payload = {
        ...shopifyData,
        id: shopifyData.id || order.shopifyOrderId || orderId,
        name: shopifyData.name ?? order.shopifyOrderName ?? `#${orderId}`,
      };
      await syncShopifyOrderToFirestore(payload);
      const riderId = phoneNumber.replace(/\D/g, "");
      const shopifyOrderId = order.shopifyOrderId || shopifyData.id || orderId;
      const res = await assignOrderToRider(shopifyOrderId, riderId);
      if (!res.success) throw new Error(res.error);

      await startLocationTracking(riderId);

      // Navigate to OrderDetails after picking
      navigation.replace("OrderDetails", { orderId });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to pick order");
    } finally {
      setPicking(false);
    }
  }, [order, orderId, phoneNumber, navigation]);

  const handleViewOnMap = useCallback(() => {
    // Navigate to OrderDetails which has the map view
    navigation.navigate("OrderDetails", { orderId });
  }, [navigation, orderId]);

  const renderContent = useMemo(() => {
    if (loading) {
      return <LoadingScreen message="Loading order..." />;
    }

    if (error || !order) {
      return (
        <SafeAreaView style={styles.container} edges={[]}>
          <StatusBar style="dark" />
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Order details</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error || "Order not found"}</Text>
          </View>
        </SafeAreaView>
      );
    }

    // Support both structures
    const shopifyData = order.shopifyData || order || {};
    const shippingAddress = shopifyData.shippingAddress || {};
    const lineItems = shopifyData.lineItems?.edges || [];

    // Safe check for total price
    const totalPriceRaw =
      shopifyData.totalPriceSet?.shopMoney || shopifyData.totalPrice?.shopMoney;
    const totalPrice =
      totalPriceRaw?.amount != null
        ? {
            amount: String(totalPriceRaw.amount),
            currencyCode: totalPriceRaw.currencyCode || "INR",
          }
        : { amount: "0.00", currencyCode: "INR" };

    const firstName =
      shippingAddress.firstName ?? (shippingAddress as any).first_name ?? "";
    const lastName =
      shippingAddress.lastName ?? (shippingAddress as any).last_name ?? "";
    const customerName =
      [firstName, lastName].filter(Boolean).join(" ").trim() || "Customer";
    const customerPhone = shippingAddress.phone || "—";
    const fullAddress = [
      shippingAddress.address1,
      shippingAddress.address2,
      shippingAddress.city,
      shippingAddress.province,
      shippingAddress.zip,
      shippingAddress.country,
    ]
      .filter(Boolean)
      .join(", ");
    const addressTruncated = fullAddress
      ? fullAddress.slice(0, 40) + (fullAddress.length > 40 ? "..." : "")
      : "—";
    const firstItemTitle = lineItems[0]?.node?.title || "Order";
    const firstItemImage = lineItems[0]?.node?.image?.url;
    const orderName = order.shopifyOrderName || order.name || `#${orderId}`; // use order.name for optimistic data
    const createdAt = order.createdAt;

    const financialStatus = shopifyData.displayFinancialStatus || "PENDING";
    const isCOD =
      financialStatus !== "PAID" && financialStatus !== "AUTHORIZED";
    const paymentTypeLabel = isCOD ? "COD" : "Prepaid";

    const orderStatus = (
      order.status ||
      shopifyData.displayFulfillmentStatus ||
      ""
    )
      .toString()
      .toUpperCase();
    const isDelivered =
      orderStatus === "DELIVERED" || orderStatus === "FULFILLED";
    const currentRiderId = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";
    const assignedToRiderId = (order.assignedTo || "").toString();
    const isAssignedToCurrentUser =
      !!currentRiderId && assignedToRiderId === currentRiderId;
    const isAssignedToOther =
      !!assignedToRiderId && assignedToRiderId !== currentRiderId;
    const canPickOrder =
      !isDelivered && !isAssignedToCurrentUser && !isAssignedToOther;

    const timelineEvents = [
      {
        id: "shipped",
        title: "Product Shipped",
        date: createdAt,
        detail1: "Courier Service: Delivery partner",
        detail2:
          "Estimated Delivery: " +
          (createdAt ? formatDateShort(createdAt) : "—"),
      },
      // TODO: Add real events based on status changes
    ];

    const tabs = [
      { id: "item_details", label: "Item Details" },
      { id: "courier", label: "Courier" },
      { id: "receiver", label: "Receiver" },
      { id: "order_history", label: "Order History" },
    ];

    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <StatusBar style="dark" />
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order details</Text>
          {getStatusDisplay() !== "Assigned" ? (
            <View style={[styles.statusBadge, styles.statusBadgeAmber]}>
              <Text style={styles.statusBadgeText}>{getStatusDisplay()}</Text>
            </View>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <View style={styles.productImageContainer}>
              {firstItemImage ? (
                <Image
                  source={{ uri: firstItemImage }}
                  style={styles.productImage}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={require("../../assets/3d-delivery-box-parcel_78370-825.avif")} /** Verify asset path validity or use fallback */
                  style={styles.productImagePlaceholder}
                  resizeMode="contain"
                />
              )}
            </View>
            <View style={styles.orderNumberRow}>
              <Text style={styles.orderNumber}>{orderName}</Text>
              <View
                style={[
                  styles.paymentBadge,
                  isCOD ? styles.paymentBadgeCOD : styles.paymentBadgePrepaid,
                ]}
              >
                <Text
                  style={[
                    styles.paymentBadgeText,
                    isCOD
                      ? styles.paymentBadgeTextCOD
                      : styles.paymentBadgeTextPrepaid,
                  ]}
                >
                  {paymentTypeLabel}
                </Text>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Item</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {firstItemTitle}
                </Text>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Receiver</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Start time</Text>
                <Text style={styles.detailValue}>{formatDate(createdAt)}</Text>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Courier</Text>
                <Text style={styles.detailValue}>Delivery partner</Text>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Address</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {addressTruncated}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleViewOnMap}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>View on map</Text>
            </TouchableOpacity>
            {canPickOrder ? (
              <TouchableOpacity
                style={[styles.btnSecondary, picking && styles.buttonDisabled]}
                onPress={handlePickOrder}
                disabled={picking}
                activeOpacity={0.8}
              >
                {picking ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.btnSecondaryText}>Pick this order</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.btnLabelOnly}>
                <Text style={styles.btnLabelOnlyText}>
                  {isDelivered
                    ? "Delivered"
                    : isAssignedToCurrentUser
                      ? "Assigned to you"
                      : "Assigned to another rider"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={styles.tab}
                onPress={() => setActiveTab(tab.id as any)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab.id && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {activeTab === tab.id && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "order_history" && (
            <View style={styles.tabContent}>
              {timelineEvents.map((event, index) => (
                <View key={event.id} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={styles.timelineDot} />
                    {index < timelineEvents.length - 1 && (
                      <View style={styles.timelineLine} />
                    )}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTitle}>{event.title}</Text>
                    <Text style={styles.timelineDate}>
                      {formatDateShort(event.date)}
                    </Text>
                    {event.detail1 && (
                      <Text style={styles.timelineDetail}>{event.detail1}</Text>
                    )}
                    {event.detail2 && (
                      <Text style={styles.timelineDetail}>{event.detail2}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === "item_details" && (
            <View style={styles.tabContent}>
              {lineItems.map((edge: any, index: number) => {
                const node = edge.node;
                const unitPrice = node.originalUnitPriceSet?.shopMoney || {
                  amount: "0",
                  currencyCode: "USD",
                };
                const lineTotal = node.originalTotalSet?.shopMoney || {
                  amount: "0",
                  currencyCode: "USD",
                };
                return (
                  <View
                    key={node.id}
                    style={[
                      styles.lineItem,
                      index > 0 && styles.lineItemBorder,
                    ]}
                  >
                    <Text style={styles.lineItemTitle} numberOfLines={2}>
                      {node.title}
                    </Text>
                    <View style={styles.lineItemRow}>
                      <Text style={styles.lineItemMeta}>
                        ×{node.quantity} ·{" "}
                        {formatPrice(unitPrice.amount, unitPrice.currencyCode)}{" "}
                        each
                      </Text>
                      <Text style={styles.lineItemTotal}>
                        {formatPrice(lineTotal.amount, lineTotal.currencyCode)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.orderTotalRow}>
                <Text style={styles.orderTotalLabel}>Order total</Text>
                <Text style={styles.orderTotalValue}>
                  {formatPrice(totalPrice.amount, totalPrice.currencyCode)}
                </Text>
              </View>
            </View>
          )}

          {activeTab === "courier" && (
            <View style={styles.tabContent}>
              <View style={styles.infoBlock}>
                <Text style={styles.detailLabel}>Courier / Contact</Text>
                <Text style={styles.detailValue}>Delivery partner</Text>
                <TouchableOpacity style={styles.linkRow} onPress={handleCall}>
                  <Ionicons
                    name="call-outline"
                    size={18}
                    color={theme.colors.success}
                  />
                  <Text style={styles.linkText}>{customerPhone}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === "receiver" && (
            <View style={styles.tabContent}>
              <View style={styles.infoBlock}>
                <Text style={styles.detailLabel}>Receiver</Text>
                <Text style={styles.detailValue}>{customerName}</Text>
                <Text style={styles.addressFull}>{fullAddress || "—"}</Text>
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={handleOpenMaps}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={theme.colors.success}
                  />
                  <Text style={styles.linkText}>Open in Maps</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }, [
    loading,
    error,
    order,
    insets,
    navigation,
    getStatusDisplay,
    picking,
    activeTab,
    formatDate,
    formatDateShort,
    formatPrice,
    handleCall,
    handleOpenMaps,
    handlePickOrder,
    handleViewOnMap,
    phoneNumber,
  ]);

  return renderContent;
};

// Styles (copied from previous view)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeAmber: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000",
  },
  errorBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.error,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summaryCard: {
    marginBottom: 16,
  },
  productImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e8e8e8",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 8,
  },
  orderNumber: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
  },
  paymentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  paymentBadgeCOD: {
    backgroundColor: "#FFF3E0",
  },
  paymentBadgePrepaid: {
    backgroundColor: "#E8F5E9",
  },
  paymentBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  paymentBadgeTextCOD: {
    color: "#E65100",
  },
  paymentBadgeTextPrepaid: {
    color: "#2E7D32",
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  detailBlock: {
    width: "50%",
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#000",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  btnLabelOnly: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabelOnlyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginRight: 16,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#999",
  },
  tabLabelActive: {
    color: theme.colors.success,
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: -1,
    height: 3,
    backgroundColor: theme.colors.success,
    borderRadius: 2,
  },
  tabContent: {
    minHeight: 200,
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  timelineLeft: {
    width: 20,
    alignItems: "center",
    marginRight: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.success,
    marginTop: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#E0E0E0",
    marginTop: 4,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 20,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  timelineDetail: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },
  lineItem: {
    marginBottom: 16,
    paddingBottom: 16,
  },
  lineItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8e8e8",
    paddingTop: 16,
  },
  lineItemTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#000",
    marginBottom: 6,
    lineHeight: 20,
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineItemMeta: {
    fontSize: 13,
    color: "#666",
  },
  lineItemTotal: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  orderTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  orderTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  infoBlock: {
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 12,
  },
  addressFull: {
    fontSize: 14,
    color: "#666",
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    color: theme.colors.success,
    fontWeight: "600",
  },
});

export default OrderPreviewScreen;
