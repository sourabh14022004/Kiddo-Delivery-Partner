import React, { useState, useEffect } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getOrderDetails, assignOrderToRider, syncShopifyOrderToFirestore } from "../services/orderService";
import { getShopifyOrderById } from "../services/shopifyService";
import { startLocationTracking } from "../services/locationService";
import LoadingScreen from "../components/LoadingScreen";
import { theme } from "../config/theme";

type TabId = "order_history" | "item_details" | "courier" | "receiver";

interface OrderPreviewScreenProps {
  orderId: string;
  phoneNumber?: string;
  onBack: () => void;
  onViewOnMap: () => void;
  onPickOrder?: (orderId: string) => void;
}

const OrderPreviewScreen: React.FC<OrderPreviewScreenProps> = ({
  orderId,
  phoneNumber,
  onBack,
  onViewOnMap,
  onPickOrder,
}) => {
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("item_details");

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      setError(null);
      let result = await getOrderDetails(orderId);
      let orderData = result.data;

      if (!result.success || !result.data) {
        const shopifyResult = await getShopifyOrderById(orderId);
        if (shopifyResult.success && shopifyResult.data) {
          await syncShopifyOrderToFirestore(shopifyResult.data);
          result = await getOrderDetails(orderId);
          if (result.success && result.data) orderData = result.data;
        } else {
          setError(shopifyResult.error || "Order not found");
          return;
        }
      }

      if (orderData) setOrder(orderData);
      else setError("Failed to load order");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | any) => {
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
  };

  const formatDateShort = (dateString: string | any) => {
    if (!dateString) return "N/A";
    const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPrice = (amount: string, currencyCode: string) => {
    const code = currencyCode === "USD" ? "$" : currencyCode + " ";
    return `${code}${parseFloat(amount || "0").toFixed(2)}`;
  };

  const getStatusDisplay = () => {
    const status = order?.status || (order?.shopifyData as any)?.displayFulfillmentStatus;
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
        return "In progress";
    }
  };

  const handleCall = () => {
    const shopifyData = order?.shopifyData || {};
    const phone = shopifyData.shippingAddress?.phone;
    if (phone) Linking.openURL(`tel:${phone.replace(/\D/g, "")}`);
  };

  const handleOpenMaps = () => {
    const shopifyData = order?.shopifyData || {};
    const addr = shopifyData.shippingAddress;
    if (!addr?.address1) return;
    const parts = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean);
    const url = `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
    Linking.openURL(url);
  };

  const handlePickOrder = async () => {
    if (!phoneNumber) {
      Alert.alert("Login required", "Please log in to pick orders.");
      return;
    }
    if (!order?.shopifyData) return;
    setPicking(true);
    try {
      const payload = {
        ...order.shopifyData,
        id: order.shopifyData.id || order.shopifyOrderId || orderId,
        name: order.shopifyData.name ?? order.shopifyOrderName ?? `#${orderId}`,
      };
      await syncShopifyOrderToFirestore(payload);
      const riderId = phoneNumber.replace(/\D/g, "");
      const shopifyOrderId = order.shopifyOrderId || order.shopifyData.id || orderId;
      const res = await assignOrderToRider(shopifyOrderId, riderId);
      if (!res.success) throw new Error(res.error);
      await startLocationTracking(riderId);
      onPickOrder?.(orderId);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to pick order");
    } finally {
      setPicking(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading order..." />;
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <StatusBar style="dark" />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
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

  const shopifyData = order.shopifyData || {};
  const shippingAddress = shopifyData.shippingAddress || {};
  const lineItems = shopifyData.lineItems?.edges || [];
  const totalPriceRaw =
    shopifyData.totalPriceSet?.shopMoney || shopifyData.totalPrice?.shopMoney;
  const totalPrice =
    totalPriceRaw?.amount != null
      ? {
          amount: String(totalPriceRaw.amount),
          currencyCode: totalPriceRaw.currencyCode || "INR",
        }
      : (() => {
          const sum = lineItems.reduce(
            (acc: number, edge: any) =>
              acc + parseFloat(edge?.node?.originalTotalSet?.shopMoney?.amount || "0"),
            0
          );
          const currencyCode =
            lineItems[0]?.node?.originalTotalSet?.shopMoney?.currencyCode || "INR";
          return { amount: sum.toFixed(2), currencyCode };
        })();
  const firstName = shippingAddress.firstName ?? (shippingAddress as any).first_name ?? "";
  const lastName = shippingAddress.lastName ?? (shippingAddress as any).last_name ?? "";
  const customerName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Customer";
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
  const addressTruncated = fullAddress ? fullAddress.slice(0, 40) + (fullAddress.length > 40 ? "..." : "") : "—";
  const firstItemTitle = lineItems[0]?.node?.title || "Order";
  const firstItemImage = lineItems[0]?.node?.image?.url;
  const orderName = order.shopifyOrderName || `#${orderId}`;
  const createdAt = order.createdAt;

  const financialStatus = shopifyData.displayFinancialStatus || "PENDING";
  const isCOD = financialStatus !== "PAID" && financialStatus !== "AUTHORIZED";
  const paymentTypeLabel = isCOD ? "COD" : "Prepaid";

  const orderStatus = (order?.status || shopifyData.displayFulfillmentStatus || "").toString().toUpperCase();
  const isDelivered = orderStatus === "DELIVERED" || orderStatus === "FULFILLED";
  const currentRiderId = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";
  const assignedToRiderId = (order?.assignedTo || "").toString();
  const isAssignedToCurrentUser = !!currentRiderId && assignedToRiderId === currentRiderId;
  const isAssignedToOther = !!assignedToRiderId && assignedToRiderId !== currentRiderId;
  const canPickOrder = !isDelivered && !isAssignedToCurrentUser && !isAssignedToOther;

  // Timeline events derived from order (simplified; real app would use fulfillment events)
  const timelineEvents = [
    {
      id: "shipped",
      title: "Product Shipped",
      date: createdAt,
      detail1: "Courier Service: Delivery partner",
      detail2: "Estimated Delivery: " + (createdAt ? formatDateShort(createdAt) : "—"),
    },
    {
      id: "packaging",
      title: "Product Packaging",
      date: createdAt,
      detail1: "Tracking number: —",
      detail2: "Warehouse: —",
    },
    {
      id: "confirmed",
      title: "Order Confirmed",
      date: createdAt,
    },
    {
      id: "placed",
      title: "Order Placed",
      date: createdAt,
    },
  ];

  const tabs: { id: TabId; label: string }[] = [
    { id: "item_details", label: "Item Details" },
    { id: "courier", label: "Courier" },
    { id: "receiver", label: "Receiver" },
    { id: "order_history", label: "Order History" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" />
      {/* Header: back + title + status */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={[styles.statusBadge, styles.statusBadgeAmber]}>
          <Text style={styles.statusBadgeText}>{getStatusDisplay()}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Product image + Order # */}
        <View style={styles.summaryCard}>
          <View style={styles.productImageContainer}>
            {firstItemImage ? (
              <Image source={{ uri: firstItemImage }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <Image
                source={require("../../assets/3d-delivery-box-parcel_78370-825.avif")}
                style={styles.productImagePlaceholder}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.orderNumberRow}>
            <Text style={styles.orderNumber}>{orderName}</Text>
            <View style={[styles.paymentBadge, isCOD ? styles.paymentBadgeCOD : styles.paymentBadgePrepaid]}>
              <Text style={[styles.paymentBadgeText, isCOD ? styles.paymentBadgeTextCOD : styles.paymentBadgeTextPrepaid]}>
                {paymentTypeLabel}
              </Text>
            </View>
          </View>

          {/* Two-column details */}
          <View style={styles.detailsGrid}>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Item</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{firstItemTitle}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Receiver</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{customerName}</Text>
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
              <Text style={styles.detailValue} numberOfLines={1}>{addressTruncated}</Text>
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={onViewOnMap} activeOpacity={0.8}>
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

        {/* Tabs */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
              {activeTab === tab.id && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        {activeTab === "order_history" && (
          <View style={styles.tabContent}>
            {timelineEvents.map((event, index) => (
              <View key={event.id} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={styles.timelineDot} />
                  {index < timelineEvents.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineTitle}>{event.title}</Text>
                  <Text style={styles.timelineDate}>{formatDateShort(event.date)}</Text>
                  {event.detail1 && <Text style={styles.timelineDetail}>{event.detail1}</Text>}
                  {event.detail2 && <Text style={styles.timelineDetail}>{event.detail2}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === "item_details" && (
          <View style={styles.tabContent}>
            {lineItems.map((edge: any, index: number) => {
              const node = edge.node;
              const unitPrice = node.originalUnitPriceSet?.shopMoney || { amount: "0", currencyCode: "USD" };
              const lineTotal = node.originalTotalSet?.shopMoney || { amount: "0", currencyCode: "USD" };
              return (
                <View key={node.id} style={[styles.lineItem, index > 0 && styles.lineItemBorder]}>
                  <Text style={styles.lineItemTitle} numberOfLines={2}>{node.title}</Text>
                  <View style={styles.lineItemRow}>
                    <Text style={styles.lineItemMeta}>×{node.quantity} · {formatPrice(unitPrice.amount, unitPrice.currencyCode)} each</Text>
                    <Text style={styles.lineItemTotal}>{formatPrice(lineTotal.amount, lineTotal.currencyCode)}</Text>
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
                <Ionicons name="call-outline" size={18} color={theme.colors.success} />
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
              <TouchableOpacity style={styles.linkRow} onPress={handleOpenMaps}>
                <Ionicons name="location-outline" size={18} color={theme.colors.success} />
                <Text style={styles.linkText}>Open in Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

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
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#333",
  },
  timelineLine: {
    position: "absolute",
    top: 10,
    width: 2,
    bottom: -8,
    backgroundColor: "#e0e0e0",
  },
  timelineBody: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    marginBottom: 2,
  },
  timelineDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  timelineDetail: {
    fontSize: 14,
    color: "#000",
    marginBottom: 2,
  },
  lineItem: {
    paddingVertical: 12,
  },
  lineItemBorder: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  lineItemTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#000",
    marginBottom: 4,
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
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  orderTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: "#eee",
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
    paddingVertical: 8,
  },
  addressFull: {
    fontSize: 14,
    color: "#333",
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.success,
  },
});

export default OrderPreviewScreen;
